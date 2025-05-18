"""
Project Manager Event Bridge

This module bridges the existing project management functionality with the new event-driven architecture.
It converts information extracted by the existing project manager into events for the new system.
"""

import json
import uuid
import os
import asyncio
from datetime import datetime
from typing import Dict, List, Any, Optional

from event_core import EventBroker, FactStore, EventFactory, Event
from view_materializer import ViewMaterializer
from agents import ProgressAgent, RelationAgent, InsightAgent

# Import from the existing project manager
from project_manager import load_project_database, save_project_database

# Global state for the event system
fact_store = None
event_broker = None
view_materializer = None
agents = {}

def initialize_event_system(redis_url="redis://localhost:6379"):
    """Initialize the core components of the event-driven system"""
    global fact_store, event_broker, view_materializer, agents
    
    # Create fact store
    fact_store = FactStore(redis_url=redis_url)
    fact_store.initialize()
    
    # Create event broker
    event_broker = EventBroker(redis_url=redis_url, fact_store=fact_store)
    event_broker.initialize()
    
    # Create view materializer
    view_materializer = ViewMaterializer(redis_url=redis_url, broker=event_broker)
    view_materializer.initialize()
    
    # Initialize agents
    agents = {}
    
    # Create and start the agents
    loop = asyncio.get_event_loop()
    
    progress_agent = ProgressAgent(broker=event_broker)
    loop.run_until_complete(progress_agent.initialize())
    loop.run_until_complete(progress_agent.start())
    agents["progress"] = progress_agent
    
    relation_agent = RelationAgent(broker=event_broker)
    loop.run_until_complete(relation_agent.initialize())
    loop.run_until_complete(relation_agent.start())
    agents["relation"] = relation_agent
    
    insight_agent = InsightAgent(broker=event_broker)
    loop.run_until_complete(insight_agent.initialize())
    loop.run_until_complete(insight_agent.start())
    agents["insight"] = insight_agent
    
    print("Event system initialized and agents started")
    
    return {
        "fact_store": fact_store,
        "event_broker": event_broker,
        "view_materializer": view_materializer,
        "agents": agents
    }

def shutdown_event_system():
    """Shutdown the event-driven system and clean up resources"""
    global fact_store, event_broker, view_materializer, agents
    
    # Stop all agents
    loop = asyncio.get_event_loop()
    
    for agent in agents.values():
        loop.run_until_complete(agent.stop())
    
    # Close connections
    if view_materializer:
        view_materializer.close()
    
    if event_broker:
        event_broker.close()
    
    if fact_store:
        fact_store.close()
    
    print("Event system shut down")

def import_existing_projects_to_events():
    """
    Import existing projects from the project database into the event system.
    This creates events for existing projects and tasks.
    """
    # Load existing project database
    project_db = load_project_database()
    
    # Source identifier for the migration
    source = "project-manager-migration"
    
    # Process projects
    for project_id, project_data in project_db.get("projects", {}).items():
        # Create ProjectCreated event
        project_created_event = EventFactory.create_project_created(
            project_id=project_id,
            project_name=project_data.get("name", project_id),
            description=project_data.get("description", ""),
            source=source
        )
        
        # Publish the event
        event_broker.publish(project_created_event)
        
        # Process tasks for this project
        tasks = project_data.get("tasks", {})
        for task_id, task_data in tasks.items():
            # Create TaskCreated event
            task_created_event = EventFactory.create_task_created(
                task_id=task_id,
                project_id=project_id,
                title=task_data.get("title", task_id),
                description=task_data.get("description", ""),
                assignee=task_data.get("assignee"),
                source=source
            )
            
            # Publish the event
            event_broker.publish(task_created_event)
            
            # If the task has a status other than "pending", publish a TaskStatusChanged event
            status = task_data.get("status", "pending")
            if status != "pending":
                status_event = EventFactory.create_task_status_changed(
                    task_id=task_id,
                    project_id=project_id,
                    old_status="pending",
                    new_status=status,
                    source=source,
                    caused_by=task_created_event.id
                )
                
                # Publish the event
                event_broker.publish(status_event)
    
    print(f"Imported {len(project_db.get('projects', {}))} projects to the event system")

def process_chat_analysis_data(analysis_data, channel_source):
    """
    Process analysis data from Discord chat and convert to events.
    This is used to bridge the existing chat analysis with the event system.
    """
    source = f"discord-{channel_source}"
    
    # Process projects from analysis
    for project_name, project_data in analysis_data.get("projects", {}).items():
        # Generate a stable project ID from the name
        project_id = f"project-{project_name.lower().replace(' ', '-')}"
        
        # Check if project exists in view materializer
        existing_project = view_materializer.get_project(project_id)
        
        if not existing_project:
            # Create new project
            project_created_event = EventFactory.create_project_created(
                project_id=project_id,
                project_name=project_name,
                description=project_data.get("description", ""),
                source=source
            )
            
            event_broker.publish(project_created_event)
            print(f"Created new project: {project_name}")
        else:
            # Update existing project if needed
            updates = {}
            if project_data.get("description") and project_data["description"] != existing_project.get("description", ""):
                updates["description"] = project_data["description"]
            
            if project_data.get("status") and project_data["status"] != existing_project.get("status", ""):
                updates["status"] = project_data["status"]
            
            if updates:
                project_updated_event = EventFactory.create_project_updated(
                    project_id=project_id,
                    updates=updates,
                    source=source
                )
                
                event_broker.publish(project_updated_event)
                print(f"Updated project: {project_name}")
        
        # Process tasks for this project
        for task_name, task_data in project_data.get("tasks", {}).items():
            # Generate a stable task ID
            task_id = f"task-{project_name.lower().replace(' ', '-')}-{task_name.lower().replace(' ', '-')}"
            
            # Check if task exists
            existing_task = view_materializer.get_task(task_id)
            
            if not existing_task:
                # Create new task
                task_created_event = EventFactory.create_task_created(
                    task_id=task_id,
                    project_id=project_id,
                    title=task_name,
                    description=task_data.get("description", ""),
                    assignee=task_data.get("assignee"),
                    source=source
                )
                
                event_broker.publish(task_created_event)
                print(f"Created new task: {task_name} for project {project_name}")
                
                # If task has a status other than "pending", publish a status change event
                status = task_data.get("status", "pending")
                if status != "pending":
                    status_event = EventFactory.create_task_status_changed(
                        task_id=task_id,
                        project_id=project_id,
                        old_status="pending",
                        new_status=status,
                        source=source,
                        caused_by=task_created_event.id
                    )
                    
                    event_broker.publish(status_event)
            else:
                # Update existing task if needed
                updates = {}
                
                if task_data.get("description") and task_data["description"] != existing_task.get("description", ""):
                    updates["description"] = task_data["description"]
                
                if task_data.get("assignee") and task_data["assignee"] != existing_task.get("assignee"):
                    updates["assignee"] = task_data["assignee"]
                
                if updates:
                    task_updated_event = EventFactory.create_task_updated(
                        task_id=task_id,
                        project_id=project_id,
                        updates=updates,
                        source=source
                    )
                    
                    event_broker.publish(task_updated_event)
                    print(f"Updated task: {task_name}")
                
                # Check status changes
                new_status = task_data.get("status")
                if new_status and new_status != existing_task.get("status", "pending"):
                    status_event = EventFactory.create_task_status_changed(
                        task_id=task_id,
                        project_id=project_id,
                        old_status=existing_task.get("status", "pending"),
                        new_status=new_status,
                        source=source
                    )
                    
                    event_broker.publish(status_event)
                    print(f"Updated task status: {task_name} to {new_status}")

def get_latest_view_data():
    """
    Get the latest data from the view materializer.
    This provides a complete view of the current state of all projects and tasks.
    """
    # Ensure view materializer is initialized
    if not view_materializer:
        return None
    
    # Get all projects and their tasks
    projects = view_materializer.get_projects()
    
    # Enrich each project with its tasks and insights
    for project in projects:
        project_id = project["projectId"]
        project["tasks"] = view_materializer.get_project_tasks(project_id)
        project["insights"] = view_materializer.get_project_insights(project_id)
    
    # Get latest insights
    latest_insights = view_materializer.get_latest_insights()
    
    return {
        "projects": projects,
        "latest_insights": latest_insights
    }

def generate_project_report(chat_session):
    """
    Generate a comprehensive project status report based on view materializer data.
    This replaces the function in project_manager.py.
    """
    # Get latest data
    view_data = get_latest_view_data()
    
    prompt = f"""
Generate a comprehensive project status report based on the following project data:
{json.dumps(view_data, indent=2)}

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