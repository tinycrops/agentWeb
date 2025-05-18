"""
View Materializer

Transforms events from the Fact Store into queryable views for the UI.
Acts as a cache layer on top of the append-only event log.
Similar to ViewMaterializer.js in the reference architecture.
"""

import json
import redis
import time
import threading
from typing import Dict, List, Any, Optional, Set, Union
from datetime import datetime
from event_core import Event, EventBroker, FactStore

class ViewMaterializer:
    """
    Materializes events into queryable views for the UI.
    Subscribes to relevant events and updates view collections.
    """
    
    def __init__(
        self, 
        redis_url: str = "redis://localhost:6379", 
        db: int = 1,  # Use different DB than FactStore
        broker: Optional[EventBroker] = None
    ):
        self.redis_url = redis_url
        self.db = db
        self.broker = broker
        self.client = None
        self.listeners = {}  # Callbacks for real-time updates
        self.subscriptions = []
        self.is_initialized = False
        
    def initialize(self):
        """Initialize the ViewMaterializer and subscribe to events"""
        if self.is_initialized:
            return
            
        if not self.broker:
            raise ValueError("Event broker is required")
            
        # Initialize Redis client for view storage
        self.client = redis.Redis.from_url(self.redis_url, db=self.db, decode_responses=True)
        
        # Test the connection
        try:
            self.client.ping()
        except redis.exceptions.ConnectionError as e:
            print(f"Failed to connect to Redis: {e}")
            raise
            
        # Ensure broker is initialized
        self.broker.initialize()
        
        # Subscribe to events
        self._subscribe_to_events()
        
        self.is_initialized = True
        print("ViewMaterializer initialized")
    
    def _subscribe_to_events(self):
        """Subscribe to all relevant events"""
        # Project events
        self.broker.subscribe("ProjectCreated", self._handle_project_created)
        self.broker.subscribe("ProjectUpdated", self._handle_project_updated)
        
        # Task events
        self.broker.subscribe("TaskCreated", self._handle_task_created)
        self.broker.subscribe("TaskUpdated", self._handle_task_updated)
        self.broker.subscribe("TaskStatusChanged", self._handle_task_status_changed)
        
        # Dependency events
        self.broker.subscribe("DependencyAdded", self._handle_dependency_added)
        
        # Progress events
        self.broker.subscribe("ProjectProgressCalculated", self._handle_project_progress)
        
        # Insight events
        self.broker.subscribe("InsightRaised", self._handle_insight_raised)
        
        print("Subscribed to all relevant events")
    
    def _handle_project_created(self, event: Event):
        """Handle a ProjectCreated event"""
        project_id = event.subject.get("projectId")
        if not project_id:
            return
            
        # Extract project data
        project_data = {
            "projectId": project_id,
            "name": event.payload.get("name", ""),
            "description": event.payload.get("description", ""),
            "status": "active",
            "createdAt": event.payload.get("createdAt", datetime.now().isoformat()),
            "updatedAt": event.payload.get("createdAt", datetime.now().isoformat()),
        }
        
        # Store in Redis
        self.client.hset(f"project:{project_id}", mapping=project_data)
        self.client.sadd("projects", project_id)
        
        # Notify listeners
        self._notify_listeners("projectCreated", project_id, project_data)
        
        print(f"Materialized project {project_id}")
    
    def _handle_project_updated(self, event: Event):
        """Handle a ProjectUpdated event"""
        project_id = event.subject.get("projectId")
        if not project_id:
            return
            
        # Get current project data
        project_data = self.client.hgetall(f"project:{project_id}")
        if not project_data:
            print(f"Project {project_id} not found")
            return
            
        # Apply updates
        updates = event.payload.get("updates", {})
        
        for key, value in updates.items():
            project_data[key] = value
            
        # Update timestamp
        project_data["updatedAt"] = event.payload.get("updatedAt", datetime.now().isoformat())
        
        # Store updated data
        self.client.hset(f"project:{project_id}", mapping=project_data)
        
        # Notify listeners
        self._notify_listeners("projectUpdated", project_id, project_data)
        
        print(f"Updated project {project_id}")
    
    def _handle_task_created(self, event: Event):
        """Handle a TaskCreated event"""
        task_id = event.subject.get("taskId")
        project_id = event.subject.get("projectId")
        
        if not all([task_id, project_id]):
            return
            
        # Extract task data
        task_data = {
            "taskId": task_id,
            "projectId": project_id,
            "title": event.payload.get("title", ""),
            "description": event.payload.get("description", ""),
            "status": event.payload.get("status", "pending"),
            "assignee": event.payload.get("assignee"),
            "createdAt": event.payload.get("createdAt", datetime.now().isoformat()),
            "updatedAt": event.payload.get("createdAt", datetime.now().isoformat()),
        }
        
        # Store in Redis
        self.client.hset(f"task:{task_id}", mapping=task_data)
        self.client.sadd(f"project:{project_id}:tasks", task_id)
        self.client.sadd("tasks", task_id)
        
        # Notify listeners
        self._notify_listeners("taskCreated", task_id, task_data)
        
        print(f"Materialized task {task_id} for project {project_id}")
    
    def _handle_task_updated(self, event: Event):
        """Handle a TaskUpdated event"""
        task_id = event.subject.get("taskId")
        project_id = event.subject.get("projectId")
        
        if not all([task_id, project_id]):
            return
            
        # Get current task data
        task_data = self.client.hgetall(f"task:{task_id}")
        if not task_data:
            print(f"Task {task_id} not found")
            return
            
        # Apply updates
        updates = event.payload.get("updates", {})
        
        for key, value in updates.items():
            task_data[key] = value
            
        # Update timestamp
        task_data["updatedAt"] = event.payload.get("updatedAt", datetime.now().isoformat())
        
        # Store updated data
        self.client.hset(f"task:{task_id}", mapping=task_data)
        
        # Notify listeners
        self._notify_listeners("taskUpdated", task_id, task_data)
        
        print(f"Updated task {task_id}")
    
    def _handle_task_status_changed(self, event: Event):
        """Handle a TaskStatusChanged event"""
        task_id = event.subject.get("taskId")
        project_id = event.subject.get("projectId")
        
        if not all([task_id, project_id]):
            return
            
        # Get current task data
        task_data = self.client.hgetall(f"task:{task_id}")
        if not task_data:
            print(f"Task {task_id} not found")
            return
            
        # Update status
        new_status = event.payload.get("newStatus")
        if new_status:
            task_data["status"] = new_status
            task_data["updatedAt"] = event.payload.get("updatedAt", datetime.now().isoformat())
            
            # Store updated data
            self.client.hset(f"task:{task_id}", mapping=task_data)
            
            # Notify listeners
            self._notify_listeners("taskStatusChanged", task_id, task_data)
            
            print(f"Updated task {task_id} status to {new_status}")
    
    def _handle_dependency_added(self, event: Event):
        """Handle a DependencyAdded event"""
        source_task_id = event.subject.get("sourceTaskId")
        target_task_id = event.subject.get("targetTaskId")
        
        if not all([source_task_id, target_task_id]):
            return
            
        # Extract dependency data
        dependency_key = f"{source_task_id}:{target_task_id}"
        dependency_data = {
            "sourceTaskId": source_task_id,
            "targetTaskId": target_task_id,
            "dependencyType": event.payload.get("dependencyType", "depends-on"),
            "createdAt": event.payload.get("createdAt", datetime.now().isoformat()),
        }
        
        # Store dependency
        self.client.hset(f"dependency:{dependency_key}", mapping=dependency_data)
        self.client.sadd(f"task:{source_task_id}:dependencies", target_task_id)
        self.client.sadd(f"task:{target_task_id}:dependents", source_task_id)
        
        # Notify listeners
        self._notify_listeners("dependencyAdded", dependency_key, dependency_data)
        
        print(f"Added dependency from {source_task_id} to {target_task_id}")
    
    def _handle_project_progress(self, event: Event):
        """Handle a ProjectProgressCalculated event"""
        project_id = event.subject.get("projectId")
        if not project_id:
            return
            
        # Extract progress data
        progress_data = {
            "progress": event.payload.get("progress", 0),
            "completedTasks": event.payload.get("completedTasks", 0),
            "totalTasks": event.payload.get("totalTasks", 0),
            "calculatedAt": event.payload.get("calculatedAt", datetime.now().isoformat()),
        }
        
        # Get current project data
        project_data = self.client.hgetall(f"project:{project_id}")
        if not project_data:
            print(f"Project {project_id} not found")
            return
            
        # Update project with progress data
        project_data.update(progress_data)
        project_data["updatedAt"] = progress_data["calculatedAt"]
        
        # Store updated data
        self.client.hset(f"project:{project_id}", mapping=project_data)
        
        # Notify listeners
        self._notify_listeners("projectProgressUpdated", project_id, project_data)
        
        print(f"Updated project {project_id} progress to {progress_data['progress']}%")
    
    def _handle_insight_raised(self, event: Event):
        """Handle an InsightRaised event"""
        project_id = event.subject.get("projectId")
        if not project_id:
            return
            
        # Extract insight data
        insight_id = f"insight:{int(time.time() * 1000)}"
        insight_data = {
            "insightId": insight_id,
            "projectId": project_id,
            "message": event.payload.get("message", ""),
            "severity": event.payload.get("severity", "info"),
            "timestamp": event.payload.get("timestamp", datetime.now().isoformat()),
            "source": event.source,
        }
        
        # Store additional data if present
        additional_data = {}
        for key, value in event.payload.items():
            if key not in ["message", "severity", "timestamp"]:
                additional_data[key] = value
                
        if additional_data:
            insight_data["additionalData"] = json.dumps(additional_data)
            
        # Store insight
        self.client.hset(f"insight:{insight_id}", mapping=insight_data)
        self.client.sadd(f"project:{project_id}:insights", insight_id)
        self.client.zadd("insights:by_time", {insight_id: int(time.time() * 1000)})
        
        # Notify listeners
        self._notify_listeners("insightRaised", insight_id, insight_data)
        
        print(f"Added insight for project {project_id}: {insight_data['message']}")
    
    def _notify_listeners(self, event_type: str, entity_id: str, data: Dict[str, Any]):
        """Notify listeners of updates"""
        if event_type in self.listeners:
            for callback in self.listeners[event_type]:
                try:
                    callback(entity_id, data)
                except Exception as e:
                    print(f"Error in listener callback: {e}")
    
    def register_listener(self, event_type: str, callback):
        """Register a callback for real-time updates"""
        if event_type not in self.listeners:
            self.listeners[event_type] = []
            
        if callback not in self.listeners[event_type]:
            self.listeners[event_type].append(callback)
            
        return True
    
    def unregister_listener(self, event_type: str, callback):
        """Unregister a callback"""
        if event_type in self.listeners and callback in self.listeners[event_type]:
            self.listeners[event_type].remove(callback)
            return True
            
        return False
    
    # API methods for retrieving data
    
    def get_projects(self):
        """Get all projects"""
        if not self.is_initialized:
            self.initialize()
            
        project_ids = self.client.smembers("projects")
        projects = []
        
        for project_id in project_ids:
            project_data = self.client.hgetall(f"project:{project_id}")
            if project_data:
                projects.append(project_data)
                
        # Sort by progress (descending)
        projects.sort(key=lambda p: float(p.get("progress", 0)), reverse=True)
        
        return projects
    
    def get_project(self, project_id: str):
        """Get a project by ID"""
        if not self.is_initialized:
            self.initialize()
            
        project_data = self.client.hgetall(f"project:{project_id}")
        if not project_data:
            return None
            
        return project_data
    
    def get_project_tasks(self, project_id: str):
        """Get tasks for a project"""
        if not self.is_initialized:
            self.initialize()
            
        task_ids = self.client.smembers(f"project:{project_id}:tasks")
        tasks = []
        
        for task_id in task_ids:
            task_data = self.client.hgetall(f"task:{task_id}")
            if task_data:
                tasks.append(task_data)
                
        return tasks
    
    def get_task(self, task_id: str):
        """Get a task by ID"""
        if not self.is_initialized:
            self.initialize()
            
        task_data = self.client.hgetall(f"task:{task_id}")
        if not task_data:
            return None
            
        return task_data
    
    def get_task_dependencies(self, task_id: str):
        """Get dependencies for a task"""
        if not self.is_initialized:
            self.initialize()
            
        dependency_ids = self.client.smembers(f"task:{task_id}:dependencies")
        dependencies = []
        
        for dep_id in dependency_ids:
            key = f"{task_id}:{dep_id}"
            dep_data = self.client.hgetall(f"dependency:{key}")
            if dep_data:
                dependencies.append(dep_data)
                
        return dependencies
    
    def get_task_dependents(self, task_id: str):
        """Get tasks that depend on this task"""
        if not self.is_initialized:
            self.initialize()
            
        dependent_ids = self.client.smembers(f"task:{task_id}:dependents")
        dependents = []
        
        for dep_id in dependent_ids:
            key = f"{dep_id}:{task_id}"
            dep_data = self.client.hgetall(f"dependency:{key}")
            if dep_data:
                dependents.append(dep_data)
                
        return dependents
    
    def get_project_insights(self, project_id: str, limit: int = 10):
        """Get insights for a project"""
        if not self.is_initialized:
            self.initialize()
            
        insight_ids = self.client.smembers(f"project:{project_id}:insights")
        insights = []
        
        for insight_id in insight_ids:
            insight_data = self.client.hgetall(f"insight:{insight_id}")
            if insight_data:
                # Parse additionalData if present
                if "additionalData" in insight_data:
                    try:
                        insight_data["additionalData"] = json.loads(insight_data["additionalData"])
                    except json.JSONDecodeError:
                        pass
                        
                insights.append(insight_data)
                
        # Sort by timestamp (descending) and limit
        insights.sort(key=lambda i: i.get("timestamp", ""), reverse=True)
        
        return insights[:limit]
    
    def get_latest_insights(self, limit: int = 10):
        """Get latest insights across all projects"""
        if not self.is_initialized:
            self.initialize()
            
        # Get the latest insight IDs from the sorted set
        insight_ids = self.client.zrevrange("insights:by_time", 0, limit-1)
        insights = []
        
        for insight_id in insight_ids:
            insight_data = self.client.hgetall(f"insight:{insight_id}")
            if insight_data:
                # Parse additionalData if present
                if "additionalData" in insight_data:
                    try:
                        insight_data["additionalData"] = json.loads(insight_data["additionalData"])
                    except json.JSONDecodeError:
                        pass
                        
                insights.append(insight_data)
                
        return insights
    
    def close(self):
        """Close connections and unsubscribe from events"""
        if self.broker:
            # Unsubscribe from all events
            event_types = [
                "ProjectCreated", "ProjectUpdated", 
                "TaskCreated", "TaskUpdated", "TaskStatusChanged",
                "DependencyAdded", "ProjectProgressCalculated", "InsightRaised"
            ]
            
            for event_type in event_types:
                handler_method = getattr(self, f"_handle_{event_type[0].lower()}{event_type[1:]}")
                self.broker.unsubscribe(event_type, handler_method)
                
        if self.client:
            self.client.close()
            
        self.is_initialized = False
        print("ViewMaterializer closed") 