"""
Agents Module

Contains the agent classes that process events and produce derived events:
- BaseAgent: Abstract base class for all agents
- ProgressAgent: Calculates project progress
- RelationAgent: Detects dependencies between tasks
- InsightAgent: Generates insights based on events
"""

import time
import json
import uuid
import asyncio
import threading
from typing import Dict, List, Any, Optional, Callable, Set, Union
from datetime import datetime
from abc import ABC, abstractmethod

from event_core import Event, EventBroker, EventFactory

class BaseAgent(ABC):
    """
    Abstract base class for all agents in the system.
    Similar to BaseAgent.js in the reference architecture.
    """
    
    def __init__(
        self, 
        agent_id: Optional[str] = None,
        name: Optional[str] = None,
        broker: Optional[EventBroker] = None,
        subscribed_events: Optional[List[str]] = None
    ):
        self.id = agent_id or f"{self.__class__.__name__}-{uuid.uuid4()}"
        self.name = name or self.__class__.__name__
        self.broker = broker
        self.subscribed_events = subscribed_events or []
        self.is_initialized = False
        self.is_running = False
        self.processed_event_count = 0
    
    async def initialize(self, broker: Optional[EventBroker] = None) -> bool:
        """Initialize the agent and subscribe to events"""
        if self.is_initialized:
            return True
            
        if broker:
            self.broker = broker
            
        if not self.broker:
            raise ValueError("Event broker is required")
            
        # Ensure broker is initialized
        self.broker.initialize()
        
        self.is_initialized = True
        print(f"Agent {self.name} ({self.id}) initialized")
        return True
    
    async def start(self) -> bool:
        """Start the agent (subscribe to events)"""
        if not self.is_initialized:
            await self.initialize()
            
        if self.is_running:
            return True
            
        # Subscribe to all specified events
        for event_kind in self.subscribed_events:
            self.broker.subscribe(event_kind, self.process_event)
            
        self.is_running = True
        print(f"Agent {self.name} ({self.id}) started")
        return True
    
    async def stop(self) -> bool:
        """Stop the agent (unsubscribe from events)"""
        if not self.is_running:
            return True
            
        # Unsubscribe from all events
        for event_kind in self.subscribed_events:
            self.broker.unsubscribe(event_kind, self.process_event)
            
        self.is_running = False
        print(f"Agent {self.name} ({self.id}) stopped")
        return True
    
    def process_event(self, event: Event) -> None:
        """Process an incoming event"""
        if not self.should_process_event(event):
            return
            
        self.processed_event_count += 1
        
        try:
            # Perform actual processing (to be implemented by subclasses)
            self._process_event_impl(event)
        except Exception as e:
            print(f"Error processing event in {self.name}: {e}")
    
    @abstractmethod
    def _process_event_impl(self, event: Event) -> None:
        """
        Internal implementation of event processing.
        Must be implemented by subclasses.
        """
        pass
    
    def should_process_event(self, event: Event) -> bool:
        """Check if an event should be processed by this agent"""
        return event.kind in self.subscribed_events
    
    async def publish_event(self, event: Event) -> bool:
        """Publish a derived event"""
        if not self.is_initialized or not self.broker:
            raise ValueError("Agent not initialized")
            
        # Set source to this agent if not specified
        if event.source != self.id:
            print(f"Warning: Event source {event.source} doesn't match agent ID {self.id}")
            
        try:
            result = self.broker.publish(event)
            return result
        except Exception as e:
            print(f"Failed to publish event from agent {self.name}: {e}")
            return False


class ProgressAgent(BaseAgent):
    """
    Agent responsible for calculating project progress.
    Listens for TaskStatusChanged events and calculates project progress.
    """
    
    def __init__(
        self, 
        agent_id: Optional[str] = None,
        broker: Optional[EventBroker] = None
    ):
        super().__init__(
            agent_id=agent_id,
            name="ProgressAgent",
            broker=broker,
            subscribed_events=["TaskStatusChanged", "TaskCreated"]
        )
        
        # State variables
        self.project_tasks = {}  # Dict[project_id, Dict[task_id, status]]
    
    def _process_event_impl(self, event: Event) -> None:
        """Process TaskStatusChanged and TaskCreated events"""
        if event.kind == "TaskStatusChanged":
            self._handle_task_status_changed(event)
        elif event.kind == "TaskCreated":
            self._handle_task_created(event)
    
    def _handle_task_status_changed(self, event: Event) -> None:
        """Handle a TaskStatusChanged event"""
        project_id = event.subject.get("projectId")
        task_id = event.subject.get("taskId")
        new_status = event.payload.get("newStatus")
        
        if not all([project_id, task_id, new_status]):
            print("Missing required fields in TaskStatusChanged event")
            return
            
        # Update task status in our state
        if project_id not in self.project_tasks:
            self.project_tasks[project_id] = {}
            
        self.project_tasks[project_id][task_id] = new_status
        
        # Calculate and publish progress
        self._calculate_project_progress(project_id, event.id)
    
    def _handle_task_created(self, event: Event) -> None:
        """Handle a TaskCreated event"""
        project_id = event.subject.get("projectId")
        task_id = event.subject.get("taskId")
        status = event.payload.get("status", "pending")
        
        if not all([project_id, task_id]):
            print("Missing required fields in TaskCreated event")
            return
            
        # Add task to our state
        if project_id not in self.project_tasks:
            self.project_tasks[project_id] = {}
            
        self.project_tasks[project_id][task_id] = status
        
        # Calculate and publish progress
        self._calculate_project_progress(project_id, event.id)
    
    def _calculate_project_progress(self, project_id: str, caused_by: str) -> None:
        """Calculate project progress and publish an event"""
        if project_id not in self.project_tasks:
            return
            
        tasks = self.project_tasks[project_id]
        total_tasks = len(tasks)
        
        if total_tasks == 0:
            return
            
        # Count completed tasks
        completed_tasks = sum(1 for status in tasks.values() if status == "completed")
        
        # Calculate progress percentage
        progress = (completed_tasks / total_tasks) * 100
        
        # Create and publish event
        progress_event = EventFactory.create_project_progress_calculated(
            project_id=project_id,
            progress=progress,
            completed_tasks=completed_tasks,
            total_tasks=total_tasks,
            source=self.id,
            caused_by=caused_by
        )
        
        self.broker.publish(progress_event)
        print(f"Project {project_id} progress: {progress:.1f}% ({completed_tasks}/{total_tasks} tasks)")


class RelationAgent(BaseAgent):
    """
    Agent responsible for detecting dependencies between tasks.
    Analyzes task creation/updates to detect potential dependencies.
    """
    
    def __init__(
        self, 
        agent_id: Optional[str] = None,
        broker: Optional[EventBroker] = None
    ):
        super().__init__(
            agent_id=agent_id,
            name="RelationAgent",
            broker=broker,
            subscribed_events=["TaskCreated", "TaskUpdated"]
        )
        
        # State variables
        self.task_dependencies = {}  # Dict[task_id, Set[dependent_task_id]]
    
    def _process_event_impl(self, event: Event) -> None:
        """Process task events to detect dependencies"""
        if event.kind in ["TaskCreated", "TaskUpdated"]:
            self._analyze_task_for_dependencies(event)
    
    def _analyze_task_for_dependencies(self, event: Event) -> None:
        """Analyze task description for potential dependencies"""
        task_id = event.subject.get("taskId")
        project_id = event.subject.get("projectId")
        
        if not all([task_id, project_id]):
            return
            
        # Extract description from appropriate field based on event type
        description = ""
        if event.kind == "TaskCreated":
            description = event.payload.get("description", "")
        elif event.kind == "TaskUpdated":
            updates = event.payload.get("updates", {})
            description = updates.get("description", "")
            
        if not description:
            return
            
        # Simple keyword-based dependency detection
        # In a real system, this would use NLP techniques
        dependency_keywords = [
            "depends on", "after", "following", "requires", "blocked by"
        ]
        
        # Extract potential dependencies from description
        # This is a simplistic approach; in reality, you'd want something more sophisticated
        tasks_mentioned = self._extract_task_mentions(description)
        
        for target_task_id in tasks_mentioned:
            # Don't create self-dependencies
            if target_task_id == task_id:
                continue
                
            # Check if this creates a cycle
            if self._would_create_cycle(task_id, target_task_id):
                print(f"Skip adding dependency from {task_id} to {target_task_id} to avoid cycle")
                continue
                
            # Create and publish dependency event
            dependency_event = EventFactory.create_dependency_added(
                source_task_id=task_id,
                target_task_id=target_task_id,
                dependency_type="depends-on",
                source=self.id,
                caused_by=event.id
            )
            
            self.broker.publish(dependency_event)
            
            # Update internal state
            if task_id not in self.task_dependencies:
                self.task_dependencies[task_id] = set()
                
            self.task_dependencies[task_id].add(target_task_id)
            
            print(f"Detected dependency: {task_id} depends on {target_task_id}")
    
    def _extract_task_mentions(self, text: str) -> List[str]:
        """
        Extract mentions of task IDs from text.
        This is a simplified implementation; a real one would be more sophisticated.
        """
        # Simple pattern matching for task-123 format
        import re
        task_pattern = r'task-([a-zA-Z0-9]+)'
        matches = re.findall(task_pattern, text.lower())
        return [f"task-{m}" for m in matches]
    
    def _would_create_cycle(self, source_task_id: str, target_task_id: str) -> bool:
        """Check if adding a dependency would create a cycle"""
        # Simple cycle detection - check if target depends on source
        visited = set()
        
        def dfs(current_id):
            if current_id == source_task_id:
                return True  # Found a path back to source = cycle
                
            if current_id in visited:
                return False  # Already visited, no cycle through this path
                
            visited.add(current_id)
            
            # Check all dependencies of the current task
            for dependent in self.task_dependencies.get(current_id, set()):
                if dfs(dependent):
                    return True
                    
            return False
            
        return dfs(target_task_id)


class InsightAgent(BaseAgent):
    """
    Agent responsible for generating insights based on events in the system.
    Triggers on ProjectProgressCalculated and DependencyAdded events.
    """
    
    def __init__(
        self, 
        agent_id: Optional[str] = None,
        broker: Optional[EventBroker] = None
    ):
        super().__init__(
            agent_id=agent_id,
            name="InsightAgent",
            broker=broker,
            subscribed_events=["ProjectProgressCalculated", "DependencyAdded"]
        )
        
        # State variables
        self.project_progress = {}  # Dict[project_id, progress]
        self.task_dependencies = {}  # Dict[task_id, Set[dependent_task_id]]
        self.insights = set()  # Set of insights already raised (to prevent duplicates)
    
    def _process_event_impl(self, event: Event) -> None:
        """Process events to generate insights"""
        if event.kind == "ProjectProgressCalculated":
            self._handle_progress_event(event)
        elif event.kind == "DependencyAdded":
            self._handle_dependency_event(event)
    
    def _handle_progress_event(self, event: Event) -> None:
        """Handle a ProjectProgressCalculated event"""
        project_id = event.subject.get("projectId")
        progress = event.payload.get("progress")
        
        if not all([project_id, progress is not None]):
            return
            
        # Update state
        self.project_progress[project_id] = progress
        
        # Generate insights based on progress
        self._check_project_progress(project_id, event.id)
    
    def _handle_dependency_event(self, event: Event) -> None:
        """Handle a DependencyAdded event"""
        source_task_id = event.subject.get("sourceTaskId")
        target_task_id = event.subject.get("targetTaskId")
        
        if not all([source_task_id, target_task_id]):
            return
            
        # Update state
        if source_task_id not in self.task_dependencies:
            self.task_dependencies[source_task_id] = set()
            
        self.task_dependencies[source_task_id].add(target_task_id)
        
        # Generate insights based on dependencies
        self._check_dependency_insights(source_task_id, target_task_id, event.id)
    
    def _check_project_progress(self, project_id: str, caused_by: str) -> None:
        """Generate insights based on project progress"""
        progress = self.project_progress.get(project_id)
        if progress is None:
            return
            
        # Generate insights based on progress thresholds
        insights = []
        
        # Project approaching completion
        if 80 <= progress < 90:
            insights.append({
                "message": f"Project is approaching completion ({progress:.1f}%)",
                "severity": "info"
            })
            
        # Project stalled (no progress for a long time)
        # This would typically check against time, but we're simplifying here
        if 25 <= progress <= 75:
            # In a real system, we'd check if progress hasn't changed in a while
            pass
            
        # Project nearly complete
        if progress >= 90:
            insights.append({
                "message": f"Project is nearly complete ({progress:.1f}%)",
                "severity": "info"
            })
            
        # Project just started
        if progress <= 10:
            insights.append({
                "message": f"Project has just started ({progress:.1f}%)",
                "severity": "info"
            })
            
        # Publish all insights
        for insight in insights:
            insight_key = f"{project_id}:{insight['message']}"
            
            if insight_key not in self.insights:
                self.insights.add(insight_key)
                
                insight_event = EventFactory.create_insight_raised(
                    project_id=project_id,
                    message=insight["message"],
                    severity=insight["severity"],
                    source=self.id,
                    caused_by=caused_by
                )
                
                self.broker.publish(insight_event)
                print(f"Insight for project {project_id}: {insight['message']}")
    
    def _check_dependency_insights(
        self, 
        source_task_id: str, 
        target_task_id: str, 
        caused_by: str
    ) -> None:
        """Generate insights based on dependencies"""
        # This could analyze the dependency graph for insights
        # For example, detect chains of dependencies that might cause delays
        
        # In a real system, this would be more sophisticated
        # For now, we'll just generate a simple insight
        
        # Check for long dependency chains (simplified)
        chain_length = self._get_dependency_chain_length(source_task_id)
        
        if chain_length > 3:
            message = f"Task {source_task_id} has a long dependency chain ({chain_length} levels)"
            insight_key = f"{source_task_id}:dependency_chain"
            
            if insight_key not in self.insights:
                self.insights.add(insight_key)
                
                # Note: In a real system, we'd associate this with a project ID
                # Here we're simplifying and using a dummy project ID
                project_id = "project-unknown"
                
                insight_event = EventFactory.create_insight_raised(
                    project_id=project_id,
                    message=message,
                    severity="warning",
                    source=self.id,
                    caused_by=caused_by,
                    additional_data={"taskId": source_task_id, "chainLength": chain_length}
                )
                
                self.broker.publish(insight_event)
                print(f"Insight for task {source_task_id}: {message}")
    
    def _get_dependency_chain_length(self, task_id: str) -> int:
        """
        Calculate the length of the dependency chain starting from a task.
        Returns the maximum chain length.
        """
        visited = set()
        
        def dfs(current_id):
            if current_id in visited:
                return 0
                
            visited.add(current_id)
            
            if current_id not in self.task_dependencies:
                return 1  # Leaf node
                
            dependencies = self.task_dependencies[current_id]
            if not dependencies:
                return 1  # Leaf node
                
            # Get the maximum length of all dependency chains
            max_length = 0
            for dep_id in dependencies:
                max_length = max(max_length, dfs(dep_id))
                
            return max_length + 1
            
        return dfs(task_id) 