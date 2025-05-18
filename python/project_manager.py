#!/usr/bin/env python3
import json
import os
import subprocess
import time
from datetime import datetime
from dotenv import load_dotenv
from google import genai

# Import functions from existing scripts
from discord_export import (
    check_docker, export_discord_channel, compress_conversation,
    load_last_timestamp, save_last_timestamp, get_most_recent_timestamp
)

# Project state storage
PROJECT_DB_FILE = "project_database.json"

def setup_gemini_model():
    """Configure and return Gemini model instance."""
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in environment variables")
    
    client = genai.Client(api_key=api_key)
    
    # Create a chat with the model
    chat = client.chats.create(
        model="gemini-2.5-flash-preview-04-17",
        config=genai.types.GenerateContentConfig(
            system_instruction="""You are a project manager AI that analyzes Discord conversations to extract actionable information, project updates, and task assignments. 
Create structured project information that includes:
1. Project names and descriptions
2. Participant roles and responsibilities
3. Current tasks and their status
4. Next actions needed for each project
5. Dependencies between projects
""",
            max_output_tokens=8192,
            temperature=0.2,
            top_p=0.95,
            top_k=40
        )
    )
    
    return chat

def load_project_database():
    """Load the project database from file"""
    try:
        with open(PROJECT_DB_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        # Return empty database if file doesn't exist or is invalid
        return {
            "projects": {},
            "participants": {},
            "last_updated": "",
            "monitored_channels": []
        }

def save_project_database(database):
    """Save the project database to file"""
    database["last_updated"] = datetime.now().isoformat()
    with open(PROJECT_DB_FILE, "w") as f:
        json.dump(database, f, indent=2)

def export_and_analyze_channel(channel_id, project_db, return_data=False):
    """Export channel data and analyze it to update the project database"""
    # Load environment variables
    load_dotenv()
    discord_token = os.getenv('DISCORD_TOKEN')
    
    if not discord_token:
        print(f"Error: DISCORD_TOKEN not found in .env file")
        return False if not return_data else (False, None)

    # Set up output directory
    output_dir = os.path.join(os.getcwd(), "team_chat")
    os.makedirs(output_dir, exist_ok=True)

    # Determine start date for export (incremental)
    start_date = load_last_timestamp(channel_id)
    if start_date:
        print(f"Performing incremental export for channel {channel_id} from {start_date}")
    else:
        print(f"No previous export found for channel {channel_id}. Performing full export.")

    # Check Docker and export channel
    if not check_docker():
        return False if not return_data else (False, None)

    if not export_discord_channel(channel_id, output_dir, discord_token, start_date):
        return False if not return_data else (False, None)

    # Process exported JSON
    print(f"Processing exported conversation for channel {channel_id}...")
    time.sleep(5)  # Wait for export to complete
    
    json_files = [f for f in os.listdir(output_dir) if f.endswith('.json')]
    matching_files = [f for f in json_files if channel_id in f]
    
    if not matching_files:
        print(f"Error: No JSON file found containing channel ID: {channel_id}")
        return False if not return_data else (False, None)
        
    json_path = os.path.join(output_dir, matching_files[0])
    
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            conversation = json.load(f)
            
        # Save the most recent timestamp for next time
        latest_timestamp = get_most_recent_timestamp(conversation)
        if latest_timestamp:
            save_last_timestamp(channel_id, latest_timestamp)
            print(f"Saved latest message timestamp: {latest_timestamp}")
            
        # Get channel name to use as an identifier
        channel_name = conversation.get("channel", {}).get("name", f"Channel_{channel_id}")
            
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"Error processing JSON file: {e}")
        return False if not return_data else (False, None)

    # Compress conversation for analysis
    summary = compress_conversation(conversation)
    
    # Initialize Gemini model for analysis
    try:
        print(f"Analyzing conversation from {channel_name}...")
        chat_session = setup_gemini_model()
        
        # Extract project information
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
        
        try:
            # Extract JSON from response
            response_text = response.text
            
            # Try to extract JSON from code blocks if present
            if "```json" in response_text and "```" in response_text.split("```json", 1)[1]:
                json_text = response_text.split("```json", 1)[1].split("```", 1)[0].strip()
            elif "```" in response_text and "```" in response_text.split("```", 1)[1]:
                json_text = response_text.split("```", 1)[1].split("```", 1)[0].strip()
            else:
                json_text = response_text.strip()
            
            # Extract JSON from response
            extracted_json = json.loads(json_text)
            
            # Update project database with new information
            update_project_database(project_db, extracted_json, channel_name)
            
            # Return the extracted JSON if requested
            if return_data:
                return True, extracted_json
            
            return True
            
        except json.JSONDecodeError:
            print(f"Error: Unable to parse response as JSON. Raw response: {response.text[:200]}...")
            return False if not return_data else (False, None)
            
    except Exception as e:
        print(f"Error during analysis: {e}")
        return False if not return_data else (False, None)

def update_project_database(db, new_data, channel_source):
    """Update the project database with new information from a channel"""
    # Add channel to monitored channels if not already present
    if channel_source not in db.get("monitored_channels", []):
        if "monitored_channels" not in db:
            db["monitored_channels"] = []
        db["monitored_channels"].append(channel_source)
    
    # Update projects
    if "projects" not in db:
        db["projects"] = {}
        
    for project_name, project_data in new_data.get("projects", {}).items():
        if project_name not in db["projects"]:
            # New project - add it completely
            db["projects"][project_name] = project_data
            db["projects"][project_name]["data_sources"] = [channel_source]
        else:
            # Existing project - update incrementally
            existing_project = db["projects"][project_name]
            
            # Add channel to data sources if not already present
            if "data_sources" not in existing_project:
                existing_project["data_sources"] = []
            if channel_source not in existing_project["data_sources"]:
                existing_project["data_sources"].append(channel_source)
            
            # Update description if provided
            if "description" in project_data and project_data["description"]:
                existing_project["description"] = project_data["description"]
            
            # Update status if provided
            if "status" in project_data and project_data["status"]:
                existing_project["status"] = project_data["status"]
            
            # Update tasks - add new ones and update existing ones
            if "tasks" not in existing_project:
                existing_project["tasks"] = {}
            for task_id, task_data in project_data.get("tasks", {}).items():
                existing_project["tasks"][task_id] = task_data
            
            # Update participants - add new ones but don't remove existing ones
            if "participants" not in existing_project:
                existing_project["participants"] = []
            for participant in project_data.get("participants", []):
                if participant not in existing_project["participants"]:
                    existing_project["participants"].append(participant)
    
    # Update participants
    if "participants" not in db:
        db["participants"] = {}
        
    for person_name, person_data in new_data.get("participants", {}).items():
        if person_name not in db["participants"]:
            # New participant - add completely
            db["participants"][person_name] = person_data
            db["participants"][person_name]["channels"] = [channel_source]
        else:
            # Existing participant - update incrementally
            existing_person = db["participants"][person_name]
            
            # Add channel to participant's channels if not already present
            if "channels" not in existing_person:
                existing_person["channels"] = []
            if channel_source not in existing_person["channels"]:
                existing_person["channels"].append(channel_source)
            
            # Update roles if provided
            if "roles" in person_data and person_data["roles"]:
                if "roles" not in existing_person:
                    existing_person["roles"] = []
                for role in person_data["roles"]:
                    if role not in existing_person["roles"]:
                        existing_person["roles"].append(role)
            
            # Update assigned tasks if provided
            if "assigned_tasks" in person_data and person_data["assigned_tasks"]:
                if "assigned_tasks" not in existing_person:
                    existing_person["assigned_tasks"] = []
                for task in person_data["assigned_tasks"]:
                    if task not in existing_person["assigned_tasks"]:
                        existing_person["assigned_tasks"].append(task)

def generate_project_report(project_db, chat_session):
    """Generate a comprehensive project status report"""
    prompt = f"""
Generate a comprehensive project status report based on the following project database:
{json.dumps(project_db, indent=2)}

Include:
1. Executive Summary
2. Project Status Overview - one paragraph per project including participants, status, and critical next steps
3. Cross-project Dependencies
4. Participants Overview - with their roles across projects
5. Recommendations - identify bottlenecks, suggest improvements

Format this as a Markdown document with appropriate headers, bullet points, and formatting.
"""
    try:
        response = chat_session.send_message(prompt)
        report = response.text
        
        # Save the report to a file
        report_filename = f"project_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
        with open(report_filename, "w", encoding="utf-8") as f:
            f.write(report)
        
        print(f"Project report generated and saved to {report_filename}")
        return report_filename
    except Exception as e:
        print(f"Error generating project report: {e}")
        return None

def main():
    """Main function to seed and update the project database"""
    # Load environment variables
    load_dotenv()
    
    # Check required environment variables
    if not os.getenv('DISCORD_TOKEN'):
        print("Error: DISCORD_TOKEN not found in .env file")
        return
    
    if not os.getenv('GEMINI_API_KEY'):
        print("Error: GEMINI_API_KEY not found in .env file")
        return
    
    # Load existing project database or create new one
    project_db = load_project_database()
    
    # Channels to monitor (can be loaded from command line args or config file)
    channels_to_monitor = [
        "",
        "",
        ""
    ]
    
    # Process each channel
    updated_channels = []
    for channel_id in channels_to_monitor:
        print(f"\nProcessing channel {channel_id}...")
        if export_and_analyze_channel(channel_id, project_db):
            updated_channels.append(channel_id)
    
    # Save updated project database
    save_project_database(project_db)
    print(f"Project database updated and saved to {PROJECT_DB_FILE}")
    
    # Generate a project report if any channels were updated
    if updated_channels:
        print("\nGenerating project status report...")
        chat_session = setup_gemini_model()
        report_file = generate_project_report(project_db, chat_session)
        
        if report_file:
            print(f"\nProject report generated successfully: {report_file}")
            print(f"Open the report file to view the current state of all projects and participants.")
        else:
            print("\nFailed to generate project report.")
    else:
        print("\nNo channels were updated. Skipping project report generation.")
    
    print("\nDone.")

if __name__ == "__main__":
    main() 