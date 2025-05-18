import streamlit as st
import os
import json
import time
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from google import genai

# Import from existing project manager
from project_manager import (
    check_docker, export_discord_channel, compress_conversation,
    load_last_timestamp, save_last_timestamp, get_most_recent_timestamp,
    setup_gemini_model
)

# Import from new event-driven architecture
from project_manager_event_bridge import (
    initialize_event_system, shutdown_event_system,
    import_existing_projects_to_events, process_chat_analysis_data,
    get_latest_view_data, generate_project_report
)

# Set page config
st.set_page_config(
    page_title="Event-Driven Project Manager",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Function to save API keys to .env file
def save_keys_to_env(discord_token, gemini_api_key):
    with open(".env", "w") as f:
        f.write(f"DISCORD_TOKEN={discord_token}\n")
        f.write(f"GEMINI_API_KEY={gemini_api_key}\n")
    load_dotenv(override=True)

# Initialize session state
if 'event_system_initialized' not in st.session_state:
    st.session_state.event_system_initialized = False
    
if 'latest_view_data' not in st.session_state:
    st.session_state.latest_view_data = None
    
if 'insights' not in st.session_state:
    st.session_state.insights = []

# Sidebar for settings
with st.sidebar:
    st.title("⚙️ Settings")
    
    # API Keys section
    st.subheader("API Keys")
    discord_token = st.text_input("Discord Token", value=os.getenv("DISCORD_TOKEN", ""), type="password", 
                                 help="Your Discord authentication token.")
    
    gemini_api_key = st.text_input("Gemini API Key", value=os.getenv("GEMINI_API_KEY", ""), type="password",
                                  help="Your Google Gemini API key.")
    
    if st.button("Save API Keys"):
        save_keys_to_env(discord_token, gemini_api_key)
        st.success("API keys saved successfully!")
    
    # Docker Status
    st.subheader("Docker Status")
    docker_status = check_docker()
    if docker_status:
        st.success("Docker is running")
    else:
        st.error("Docker is not running or not installed")
        st.info("This tool requires Docker to be installed and running for Discord exports.")
        
    # Event System
    st.subheader("Event System")
    
    if st.session_state.event_system_initialized:
        if st.button("Stop Event System"):
            shutdown_event_system()
            st.session_state.event_system_initialized = False
            st.success("Event system stopped")
    else:
        if st.button("Start Event System"):
            try:
                initialize_event_system()
                st.session_state.event_system_initialized = True
                
                # Import existing projects
                with st.spinner("Importing existing projects..."):
                    import_existing_projects_to_events()
                
                st.success("Event system started and existing projects imported")
            except Exception as e:
                st.error(f"Failed to start event system: {e}")

# Main content
st.title("Event-Driven Project Manager")
st.markdown("Manage projects with an event-driven architecture for real-time analysis and insights.")

# Check if event system is initialized
if not st.session_state.event_system_initialized:
    st.warning("Please start the event system in the sidebar to enable all features.")

# Tabs for different functions
tab1, tab2, tab3, tab4 = st.tabs(["Discord Export", "Projects", "Tasks", "Insights"])

# Discord Export tab
with tab1:
    st.header("Import Discord Conversations")
    
    col1, col2 = st.columns(2)
    
    with col1:
        channel_id = st.text_input("Channel ID", help="The ID of the Discord channel you want to export.")
        
        # Date range selection
        date_options = st.radio("Export Range", ["Full History", "Date Range", "Incremental (since last export)"])
        
        if date_options == "Date Range":
            start_date = st.date_input("Start Date")
            end_date = st.date_input("End Date")
        else:
            start_date = None
            end_date = None
    
    with col2:
        st.subheader("Export Options")
        export_format = st.selectbox("Export Format", ["Json", "HtmlDark", "HtmlLight", "Csv", "PlainText"], index=0)
        download_media = st.checkbox("Download Media (images, avatars, etc.)", value=False)
        include_threads = st.selectbox("Include Threads", ["none", "active", "all"], index=0)
        
    export_button = st.button("Export and Analyze Conversation", use_container_width=True, type="primary")
    
    if export_button:
        if not channel_id:
            st.error("Please provide a Channel ID")
        elif not os.getenv("DISCORD_TOKEN"):
            st.error("Please provide a Discord Token in the settings")
        elif not os.getenv("GEMINI_API_KEY"):
            st.error("Please provide a Gemini API Key in the settings")
        elif not docker_status:
            st.error("Docker is required but not available")
        elif not st.session_state.event_system_initialized:
            st.error("Please start the event system first")
        else:
            # Set up progress bar
            progress_bar = st.progress(0)
            status_text = st.empty()
            
            # Create output directory
            output_dir = os.path.join(os.getcwd(), "team_chat")
            os.makedirs(output_dir, exist_ok=True)
            
            # Determine start date for incremental export
            if date_options == "Incremental (since last export)":
                last_timestamp = load_last_timestamp(channel_id)
                if last_timestamp:
                    start_date_str = last_timestamp
                    status_text.info(f"Performing incremental export from {start_date_str}")
                else:
                    status_text.info("No previous export found. Performing full export.")
                    start_date_str = None
            elif date_options == "Date Range":
                start_date_str = start_date.isoformat()
                end_date_str = end_date.isoformat()
            else:
                start_date_str = None
                end_date_str = None
            
            progress_bar.progress(25, text="Starting export...")
            
            try:
                # Export channel data
                status_text.info("Exporting conversation...")
                if not export_discord_channel(channel_id, output_dir, os.getenv("DISCORD_TOKEN"), start_date_str):
                    st.error("Failed to export channel data")
                    progress_bar.empty()
                    status_text.empty()
                else:
                    progress_bar.progress(50, text="Analyzing conversation...")
                    
                    # Find the exported file
                    time.sleep(2)  # Wait for file to be written
                    json_files = [f for f in os.listdir(output_dir) if f.endswith('.json') and channel_id in f]
                    
                    if not json_files:
                        st.error("No export file found")
                        progress_bar.empty()
                        status_text.empty()
                    else:
                        json_path = os.path.join(output_dir, json_files[0])
                        
                        try:
                            # Read the conversation
                            with open(json_path, "r", encoding="utf-8") as f:
                                conversation = json.load(f)
                                
                            # Get channel name
                            channel_name = conversation.get("channel", {}).get("name", f"Channel_{channel_id}")
                            
                            # Update timestamp for incremental exports
                            latest_timestamp = get_most_recent_timestamp(conversation)
                            if latest_timestamp:
                                save_last_timestamp(channel_id, latest_timestamp)
                                
                            # Compress and analyze conversation
                            summary = compress_conversation(conversation)
                            
                            # Initialize Gemini model
                            chat_session = setup_gemini_model()
                            
                            # Analyze conversation
                            progress_bar.progress(75, text="Generating project data...")
                            status_text.info("Analyzing conversation with AI...")
                            
                            prompt = f"""
Analyze this Discord conversation and extract all relevant information about projects, tasks, and participants. 
Please format your response as a structured JSON with these fields:
- projects: A dictionary with project names as keys, each containing description, status, tasks, and participants
- participants: A dictionary with participant names as keys, containing their roles and assigned tasks

Here's the conversation summary:
{summary}

Respond ONLY with the valid JSON object. Include only information clearly mentioned in the conversation.
"""
                            
                            response = chat_session.send_message(prompt)
                            
                            # Extract JSON from response
                            response_text = response.text
                            
                            # Try to extract JSON from code blocks if present
                            if "```json" in response_text and "```" in response_text.split("```json", 1)[1]:
                                json_text = response_text.split("```json", 1)[1].split("```", 1)[0].strip()
                            elif "```" in response_text and "```" in response_text.split("```", 1)[1]:
                                json_text = response_text.split("```", 1)[1].split("```", 1)[0].strip()
                            else:
                                json_text = response_text.strip()
                                
                            # Parse JSON
                            extracted_json = json.loads(json_text)
                            
                            # Process the analysis with event system
                            progress_bar.progress(90, text="Updating project data...")
                            status_text.info("Processing with event system...")
                            
                            # Send to event system
                            process_chat_analysis_data(extracted_json, channel_name)
                            
                            # Update view data in session state
                            st.session_state.latest_view_data = get_latest_view_data()
                            
                            progress_bar.progress(100, text="Complete!")
                            status_text.success(f"Analysis complete for channel {channel_name}")
                            
                            # Show summary of found projects
                            st.subheader("Analysis Results")
                            st.write(f"Found {len(extracted_json.get('projects', {}))} projects and {len(extracted_json.get('participants', {}))} participants")
                            
                            # Option to generate report
                            if st.button("Generate Project Report"):
                                with st.spinner("Generating report..."):
                                    report_file = generate_project_report(chat_session)
                                    if report_file:
                                        st.success(f"Report generated: {report_file}")
                                    else:
                                        st.error("Failed to generate report")
                            
                        except Exception as e:
                            st.error(f"Analysis error: {str(e)}")
                            progress_bar.empty()
                            status_text.empty()
                
            except Exception as e:
                st.error(f"Process error: {str(e)}")
                progress_bar.empty()
                status_text.empty()

# Projects tab
with tab2:
    st.header("Projects")
    
    # Refresh button to get latest data
    if st.button("Refresh Project Data"):
        if st.session_state.event_system_initialized:
            with st.spinner("Loading project data..."):
                st.session_state.latest_view_data = get_latest_view_data()
            st.success("Project data refreshed")
        else:
            st.error("Event system not initialized")
    
    # Display projects if available
    if st.session_state.latest_view_data:
        projects = st.session_state.latest_view_data.get("projects", [])
        
        if not projects:
            st.info("No projects found. Try importing data from Discord.")
        else:
            # Create a metric row for key statistics
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Total Projects", len(projects))
            
            with col2:
                active_projects = sum(1 for p in projects if p.get("status") == "active")
                st.metric("Active Projects", active_projects)
                
            with col3:
                avg_progress = sum(float(p.get("progress", 0)) for p in projects) / len(projects) if projects else 0
                st.metric("Average Progress", f"{avg_progress:.1f}%")
            
            # Project selection
            selected_project = st.selectbox(
                "Select a project to view details",
                options=[p.get("name", p.get("projectId")) for p in projects],
                format_func=lambda x: x
            )
            
            # Find the selected project
            selected_project_data = next(
                (p for p in projects if p.get("name", p.get("projectId")) == selected_project), 
                None
            )
            
            if selected_project_data:
                st.subheader(f"Project: {selected_project}")
                
                # Project details
                col1, col2 = st.columns(2)
                
                with col1:
                    st.write("**Description:**")
                    st.write(selected_project_data.get("description", "No description available"))
                    
                    st.write("**Status:**")
                    status = selected_project_data.get("status", "unknown")
                    status_color = {
                        "active": "green",
                        "completed": "blue",
                        "blocked": "red",
                        "on_hold": "orange"
                    }.get(status, "gray")
                    
                    st.markdown(f"<span style='color:{status_color};font-weight:bold'>{status.upper()}</span>", unsafe_allow_html=True)
                
                with col2:
                    # Progress bar
                    progress = float(selected_project_data.get("progress", 0))
                    st.write("**Progress:**")
                    st.progress(progress / 100)
                    st.write(f"{progress:.1f}% Complete")
                    
                    # Task counts
                    completed_tasks = int(selected_project_data.get("completedTasks", 0))
                    total_tasks = int(selected_project_data.get("totalTasks", 0))
                    st.write(f"**Tasks:** {completed_tasks}/{total_tasks} completed")
                
                # Tasks
                st.subheader("Tasks")
                tasks = selected_project_data.get("tasks", [])
                
                if not tasks:
                    st.info("No tasks found for this project")
                else:
                    task_df = []
                    for task in tasks:
                        task_df.append({
                            "Task ID": task.get("taskId", ""),
                            "Title": task.get("title", ""),
                            "Status": task.get("status", "pending"),
                            "Assignee": task.get("assignee", "Unassigned"),
                            "Updated": task.get("updatedAt", "")
                        })
                    
                    # Show tasks in a table
                    st.dataframe(task_df)
                
                # Insights
                st.subheader("Insights")
                insights = selected_project_data.get("insights", [])
                
                if not insights:
                    st.info("No insights available for this project")
                else:
                    for insight in insights:
                        severity = insight.get("severity", "info")
                        message = insight.get("message", "")
                        timestamp = insight.get("timestamp", "")
                        
                        # Format timestamp
                        try:
                            dt = datetime.fromisoformat(timestamp)
                            formatted_time = dt.strftime("%Y-%m-%d %H:%M")
                        except:
                            formatted_time = timestamp
                        
                        # Set color based on severity
                        color = {
                            "info": "blue",
                            "warning": "orange",
                            "critical": "red"
                        }.get(severity, "gray")
                        
                        st.markdown(f"""
                        <div style='border-left:3px solid {color}; padding-left:10px; margin-bottom:10px;'>
                            <div style='color:{color};font-weight:bold'>{severity.upper()}</div>
                            <div>{message}</div>
                            <div style='font-size:0.8em;color:gray'>{formatted_time}</div>
                        </div>
                        """, unsafe_allow_html=True)
    else:
        st.info("No project data available. Start the event system and import data from Discord.")

# Tasks tab
with tab3:
    st.header("Tasks")
    
    # Display all tasks if available
    if st.session_state.latest_view_data:
        projects = st.session_state.latest_view_data.get("projects", [])
        
        # Collect all tasks
        all_tasks = []
        for project in projects:
            project_id = project.get("projectId")
            project_name = project.get("name", project_id)
            
            for task in project.get("tasks", []):
                task["projectName"] = project_name
                all_tasks.append(task)
        
        if not all_tasks:
            st.info("No tasks found. Try importing data from Discord.")
        else:
            # Create metrics for tasks
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Total Tasks", len(all_tasks))
            
            with col2:
                completed_tasks = sum(1 for t in all_tasks if t.get("status") == "completed")
                st.metric("Completed Tasks", completed_tasks)
                
            with col3:
                pending_tasks = sum(1 for t in all_tasks if t.get("status") == "pending")
                st.metric("Pending Tasks", pending_tasks)
                
            # Task filters
            st.subheader("Task Filters")
            
            col1, col2 = st.columns(2)
            
            with col1:
                status_filter = st.multiselect(
                    "Filter by Status",
                    options=list(set(t.get("status", "pending") for t in all_tasks)),
                    default=[]
                )
            
            with col2:
                project_filter = st.multiselect(
                    "Filter by Project",
                    options=list(set(t.get("projectName") for t in all_tasks)),
                    default=[]
                )
            
            # Apply filters
            filtered_tasks = all_tasks
            if status_filter:
                filtered_tasks = [t for t in filtered_tasks if t.get("status", "pending") in status_filter]
            if project_filter:
                filtered_tasks = [t for t in filtered_tasks if t.get("projectName") in project_filter]
            
            # Show tasks
            st.subheader(f"Tasks ({len(filtered_tasks)})")
            
            # Convert to table
            task_rows = []
            for task in filtered_tasks:
                task_rows.append({
                    "Task ID": task.get("taskId", ""),
                    "Title": task.get("title", ""),
                    "Project": task.get("projectName", ""),
                    "Status": task.get("status", "pending"),
                    "Assignee": task.get("assignee", "Unassigned"),
                    "Updated": task.get("updatedAt", "")
                })
            
            st.dataframe(task_rows)
    else:
        st.info("No task data available. Start the event system and import data from Discord.")

# Insights tab
with tab4:
    st.header("Insights")
    
    # Display insights if available
    if st.session_state.latest_view_data:
        insights = st.session_state.latest_view_data.get("latest_insights", [])
        
        if not insights:
            st.info("No insights available. Insights are generated automatically as data is processed.")
        else:
            # Insight metrics
            col1, col2, col3 = st.columns(3)
            
            with col1:
                st.metric("Total Insights", len(insights))
            
            with col2:
                critical_insights = sum(1 for i in insights if i.get("severity") == "critical")
                st.metric("Critical Insights", critical_insights)
                
            with col3:
                warning_insights = sum(1 for i in insights if i.get("severity") == "warning")
                st.metric("Warnings", warning_insights)
            
            # Insight filters
            severity_filter = st.multiselect(
                "Filter by Severity",
                options=list(set(i.get("severity", "info") for i in insights)),
                default=[]
            )
            
            # Apply filters
            filtered_insights = insights
            if severity_filter:
                filtered_insights = [i for i in filtered_insights if i.get("severity", "info") in severity_filter]
            
            # Display insights
            st.subheader(f"Latest Insights ({len(filtered_insights)})")
            
            for insight in filtered_insights:
                severity = insight.get("severity", "info")
                message = insight.get("message", "")
                timestamp = insight.get("timestamp", "")
                project_id = insight.get("projectId", "")
                
                # Get project name if available
                project_name = project_id
                projects = st.session_state.latest_view_data.get("projects", [])
                for project in projects:
                    if project.get("projectId") == project_id:
                        project_name = project.get("name", project_id)
                        break
                
                # Format timestamp
                try:
                    dt = datetime.fromisoformat(timestamp)
                    formatted_time = dt.strftime("%Y-%m-%d %H:%M")
                except:
                    formatted_time = timestamp
                
                # Set color based on severity
                color = {
                    "info": "blue",
                    "warning": "orange",
                    "critical": "red"
                }.get(severity, "gray")
                
                st.markdown(f"""
                <div style='border-left:3px solid {color}; padding-left:10px; margin-bottom:15px;'>
                    <div style='color:{color};font-weight:bold'>{severity.upper()}</div>
                    <div style='font-weight:bold'>{project_name}</div>
                    <div>{message}</div>
                    <div style='font-size:0.8em;color:gray'>{formatted_time}</div>
                </div>
                """, unsafe_allow_html=True)
    else:
        st.info("No insight data available. Start the event system and import data from Discord.")

# Footer
st.markdown("---")
st.caption("Event-Driven Project Manager v1.0 | Powered by Gemini and Streamlit")

# Clean up resources when the app is closed
def cleanup():
    if st.session_state.event_system_initialized:
        shutdown_event_system()
        st.session_state.event_system_initialized = False

# Register cleanup handler
import atexit
atexit.register(cleanup) 