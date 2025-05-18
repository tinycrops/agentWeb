#!/usr/bin/env python3
"""
Main entry point for the event-driven project management system.
This combines the Discord chat processing with the event-driven architecture.
"""

import os
import json
import time
from datetime import datetime
from dotenv import load_dotenv

# Import from existing modules
from project_manager import (
    setup_gemini_model, load_project_database,
    export_and_analyze_channel
)

# Import from new event-driven architecture
from project_manager_event_bridge import (
    initialize_event_system, shutdown_event_system,
    import_existing_projects_to_events, process_chat_analysis_data,
    generate_project_report
)

def main():
    """Main entry point for the event-driven project management system"""
    # Load environment variables
    load_dotenv()
    
    # Check required environment variables
    if not os.getenv('DISCORD_TOKEN'):
        print("Error: DISCORD_TOKEN not found in .env file")
        return
    
    if not os.getenv('GEMINI_API_KEY'):
        print("Error: GEMINI_API_KEY not found in .env file")
        return
    
    try:
        # Initialize event system
        print("\nInitializing event-driven architecture...")
        event_system = initialize_event_system()
        
        # Import existing projects (if any)
        print("\nImporting existing projects to event system...")
        import_existing_projects_to_events()
        
        # Load project database for chat analysis
        project_db = load_project_database()
        
        # Channels to monitor (can be loaded from command line args or config file)
        channels_to_monitor = [
            "1361937027561554000",
            "1372416281394806834",
            "1310060483943989369"
        ]
        
        # Process each channel
        updated_channels = []
        for channel_id in channels_to_monitor:
            print(f"\nProcessing channel {channel_id}...")
            
            # Use existing function to export and analyze the channel
            # This returns the analysis data from the LLM
            success, analysis_data = export_and_analyze_channel(channel_id, project_db, return_data=True)
            
            if success and analysis_data:
                # Bridge to our event system
                process_chat_analysis_data(analysis_data, channel_id)
                updated_channels.append(channel_id)
        
        # Generate a project report if any channels were updated
        if updated_channels:
            print("\nGenerating project status report...")
            chat_session = setup_gemini_model()
            report_file = generate_project_report(chat_session)
            
            if report_file:
                print(f"\nProject report generated successfully: {report_file}")
                print(f"Open the report file to view the current state of all projects and participants.")
            else:
                print("\nFailed to generate project report.")
        else:
            print("\nNo channels were updated. Skipping project report generation.")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        # Shutdown event system
        print("\nShutting down event system...")
        shutdown_event_system()
        
    print("\nDone.")

if __name__ == "__main__":
    main() 