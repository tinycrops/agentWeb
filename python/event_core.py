"""
Event Core Module

Core components for the event-driven architecture:
- Event: Base class for all events in the system
- EventFactory: Factory for creating standardized events
- EventBroker: Publisher/subscriber system for events
- FactStore: Single source of truth for all events
"""

import json
import uuid
import time
import hashlib
import asyncio
import threading
import redis
from datetime import datetime
from typing import Dict, List, Any, Optional, Callable, Set, Union

class Event:
    """
    Base event class for all events in the system.
    Similar to the Event.js model in the reference architecture.
    """
    def __init__(
        self, 
        source: str, 
        kind: str, 
        subject: Dict[str, Any], 
        payload: Dict[str, Any], 
        event_id: Optional[str] = None,
        timestamp: Optional[int] = None,
        caused_by: Optional[str] = None
    ):
        self.id = event_id or str(uuid.uuid4())
        self.ts = timestamp or int(time.time() * 1000)
        self.source = source
        self.kind = kind
        self.subject = subject
        self.payload = payload
        self.caused_by = caused_by
        self.sig = self._generate_signature()
    
    def _generate_signature(self) -> str:
        """Generate cryptographic signature for event integrity verification"""
        content = json.dumps({
            "id": self.id,
            "ts": self.ts,
            "source": self.source,
            "kind": self.kind,
            "subject": self.subject,
            "payload": self.payload,
            "caused_by": self.caused_by
        }, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()
    
    def verify_integrity(self) -> bool:
        """Verify the integrity of this event"""
        expected_sig = self._generate_signature()
        return self.sig == expected_sig
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary"""
        return {
            "id": self.id,
            "ts": self.ts,
            "source": self.source,
            "kind": self.kind,
            "subject": self.subject,
            "payload": self.payload,
            "caused_by": self.caused_by,
            "sig": self.sig
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Event':
        """Create an Event from a dictionary"""
        event = cls(
            source=data["source"],
            kind=data["kind"],
            subject=data["subject"],
            payload=data["payload"],
            event_id=data["id"],
            timestamp=data["ts"],
            caused_by=data.get("caused_by")
        )
        # Override auto-generated signature with stored one
        event.sig = data["sig"]
        return event


class EventFactory:
    """
    Factory for creating standard event types with proper structure.
    Similar to EventFactory.js in the reference architecture.
    """
    
    @staticmethod
    def create_project_created(
        project_id: str, 
        project_name: str, 
        description: str, 
        source: str,
        caused_by: Optional[str] = None
    ) -> Event:
        """Create a ProjectCreated event"""
        return Event(
            source=source,
            kind="ProjectCreated",
            subject={"projectId": project_id},
            payload={
                "name": project_name,
                "description": description,
                "createdAt": datetime.now().isoformat(),
            },
            caused_by=caused_by
        )
    
    @staticmethod
    def create_project_updated(
        project_id: str, 
        updates: Dict[str, Any], 
        source: str,
        caused_by: Optional[str] = None
    ) -> Event:
        """Create a ProjectUpdated event"""
        return Event(
            source=source,
            kind="ProjectUpdated",
            subject={"projectId": project_id},
            payload={
                "updates": updates,
                "updatedAt": datetime.now().isoformat(),
            },
            caused_by=caused_by
        )
    
    @staticmethod
    def create_task_created(
        task_id: str, 
        project_id: str, 
        title: str, 
        description: str, 
        assignee: Optional[str],
        source: str,
        caused_by: Optional[str] = None
    ) -> Event:
        """Create a TaskCreated event"""
        return Event(
            source=source,
            kind="TaskCreated",
            subject={"taskId": task_id, "projectId": project_id},
            payload={
                "title": title,
                "description": description,
                "assignee": assignee,
                "status": "pending",
                "createdAt": datetime.now().isoformat(),
            },
            caused_by=caused_by
        )
    
    @staticmethod
    def create_task_updated(
        task_id: str, 
        project_id: str, 
        updates: Dict[str, Any], 
        source: str,
        caused_by: Optional[str] = None
    ) -> Event:
        """Create a TaskUpdated event"""
        return Event(
            source=source,
            kind="TaskUpdated",
            subject={"taskId": task_id, "projectId": project_id},
            payload={
                "updates": updates,
                "updatedAt": datetime.now().isoformat(),
            },
            caused_by=caused_by
        )
    
    @staticmethod
    def create_task_status_changed(
        task_id: str, 
        project_id: str, 
        old_status: str, 
        new_status: str,
        source: str,
        caused_by: Optional[str] = None
    ) -> Event:
        """Create a TaskStatusChanged event"""
        return Event(
            source=source,
            kind="TaskStatusChanged",
            subject={"taskId": task_id, "projectId": project_id},
            payload={
                "oldStatus": old_status,
                "newStatus": new_status,
                "updatedAt": datetime.now().isoformat(),
            },
            caused_by=caused_by
        )
    
    @staticmethod
    def create_dependency_added(
        source_task_id: str, 
        target_task_id: str, 
        dependency_type: str,
        source: str,
        caused_by: Optional[str] = None
    ) -> Event:
        """Create a DependencyAdded event"""
        return Event(
            source=source,
            kind="DependencyAdded",
            subject={"sourceTaskId": source_task_id, "targetTaskId": target_task_id},
            payload={
                "dependencyType": dependency_type,
                "createdAt": datetime.now().isoformat(),
            },
            caused_by=caused_by
        )
        
    @staticmethod
    def create_insight_raised(
        project_id: str, 
        message: str, 
        severity: str, 
        source: str,
        caused_by: Optional[str] = None,
        additional_data: Optional[Dict[str, Any]] = None
    ) -> Event:
        """Create an InsightRaised event"""
        payload = {
            "message": message,
            "severity": severity,
            "timestamp": datetime.now().isoformat(),
        }
        
        if additional_data:
            payload.update(additional_data)
            
        return Event(
            source=source,
            kind="InsightRaised",
            subject={"projectId": project_id},
            payload=payload,
            caused_by=caused_by
        )
    
    @staticmethod
    def create_project_progress_calculated(
        project_id: str, 
        progress: float, 
        completed_tasks: int, 
        total_tasks: int,
        source: str,
        caused_by: Optional[str] = None
    ) -> Event:
        """Create a ProjectProgressCalculated event"""
        return Event(
            source=source,
            kind="ProjectProgressCalculated",
            subject={"projectId": project_id},
            payload={
                "progress": progress,
                "completedTasks": completed_tasks,
                "totalTasks": total_tasks,
                "calculatedAt": datetime.now().isoformat(),
            },
            caused_by=caused_by
        )


class FactStore:
    """
    Single source of truth for all events. 
    This is an append-only log of all events in the system.
    Similar to FactStore.js in the reference architecture.
    """
    
    def __init__(self, redis_url: str = "redis://localhost:6379", db: int = 0):
        self.redis_url = redis_url
        self.db = db
        self.client = None
        self.source_id = f"factstore-{uuid.uuid4()}"
        self.is_initialized = False
    
    def initialize(self):
        """Initialize the FactStore connection"""
        if self.is_initialized:
            return
        
        self.client = redis.Redis.from_url(self.redis_url, db=self.db, decode_responses=True)
        
        # Test the connection
        try:
            self.client.ping()
            self.is_initialized = True
            print("FactStore initialized")
        except redis.exceptions.ConnectionError as e:
            print(f"Failed to initialize FactStore: {e}")
            raise
    
    def append(self, event: Event) -> bool:
        """
        Append an event to the store.
        Returns True if the event was stored successfully.
        """
        if not self.is_initialized:
            self.initialize()
        
        # Verify event integrity
        if not event.verify_integrity():
            print(f"Event {event.id} failed integrity check")
            return False
        
        try:
            # Use pipeline for transaction
            with self.client.pipeline() as pipe:
                # Check if event already exists
                event_key = f"event:{event.id}"
                exists = pipe.exists(event_key).execute()[0]
                
                if exists:
                    # Event already stored
                    return True
                
                # Convert event to JSON
                event_json = json.dumps(event.to_dict())
                
                # Store the event by ID
                pipe.set(event_key, event_json)
                
                # Add to events by kind set
                pipe.sadd(f"events:kind:{event.kind}", event.id)
                
                # Add to sorted set by timestamp
                pipe.zadd("events:by_time", {event.id: event.ts})
                
                # If it has a subject with projectId, index by project
                if "projectId" in event.subject:
                    project_id = event.subject["projectId"]
                    pipe.sadd(f"events:project:{project_id}", event.id)
                
                # Execute all commands atomically
                pipe.execute()
                
                return True
        except Exception as e:
            print(f"Failed to append event {event.id}: {e}")
            return False
    
    def get_by_id(self, event_id: str) -> Optional[Event]:
        """Get an event by its ID"""
        if not self.is_initialized:
            self.initialize()
        
        event_key = f"event:{event_id}"
        event_json = self.client.get(event_key)
        
        if not event_json:
            return None
        
        try:
            event_data = json.loads(event_json)
            return Event.from_dict(event_data)
        except json.JSONDecodeError:
            print(f"Failed to parse event {event_id}")
            return None
    
    def get_by_kind(self, kind: str, limit: int = 100) -> List[Event]:
        """Get events by kind"""
        if not self.is_initialized:
            self.initialize()
        
        # Get event IDs of this kind
        event_ids = self.client.smembers(f"events:kind:{kind}")
        events = []
        
        # Get events by ID
        for event_id in list(event_ids)[:limit]:
            event = self.get_by_id(event_id)
            if event:
                events.append(event)
        
        return events
    
    def get_by_project(self, project_id: str, limit: int = 100) -> List[Event]:
        """Get events for a specific project"""
        if not self.is_initialized:
            self.initialize()
        
        # Get event IDs for this project
        event_ids = self.client.smembers(f"events:project:{project_id}")
        events = []
        
        # Get events by ID
        for event_id in list(event_ids)[:limit]:
            event = self.get_by_id(event_id)
            if event:
                events.append(event)
        
        return events
    
    def get_latest(self, limit: int = 10) -> List[Event]:
        """Get the latest events"""
        if not self.is_initialized:
            self.initialize()
        
        # Get the latest event IDs from the sorted set
        event_ids = self.client.zrevrange("events:by_time", 0, limit-1)
        events = []
        
        # Get events by ID
        for event_id in event_ids:
            event = self.get_by_id(event_id)
            if event:
                events.append(event)
        
        return events
    
    def close(self):
        """Close the connection"""
        if self.client:
            self.client.close()
            self.is_initialized = False
            print("FactStore connection closed")


class EventBroker:
    """
    Pub/sub system that distributes events to interested agents.
    Similar to EventBroker.js in the reference architecture.
    """
    
    def __init__(self, redis_url: str = "redis://localhost:6379", db: int = 0, fact_store: Optional[FactStore] = None):
        self.redis_url = redis_url
        self.db = db
        self.client = None
        self.pubsub = None
        self.fact_store = fact_store
        self.subscribers = {}  # Dict[str, List[Callable]]
        self.running = False
        self.pubsub_thread = None
        self.is_initialized = False
    
    def initialize(self):
        """Initialize the EventBroker connection"""
        if self.is_initialized:
            return
        
        self.client = redis.Redis.from_url(self.redis_url, db=self.db, decode_responses=False)
        self.pubsub = self.client.pubsub(ignore_subscribe_messages=True)
        
        # If no FactStore is provided, create one
        if not self.fact_store:
            self.fact_store = FactStore(self.redis_url, self.db)
            self.fact_store.initialize()
        
        self.is_initialized = True
        print("EventBroker initialized")
    
    def publish(self, event: Event) -> bool:
        """
        Publish an event to interested subscribers.
        Returns True if the event was published successfully.
        """
        if not self.is_initialized:
            self.initialize()
        
        try:
            # First store in FactStore
            stored = self.fact_store.append(event)
            
            if not stored:
                print(f"Failed to store event {event.id} in FactStore")
                return False
            
            # Publish to Redis
            channel = f"events:{event.kind}"
            self.client.publish(channel, json.dumps(event.to_dict()).encode())
            
            print(f"Published event {event.id} to channel {channel}")
            return True
        except Exception as e:
            print(f"Failed to publish event {event.id}: {e}")
            return False
    
    def subscribe(self, kind: str, callback: Callable[[Event], None]) -> bool:
        """
        Subscribe to events of a specific kind.
        Returns True if the subscription was successful.
        """
        if not self.is_initialized:
            self.initialize()
        
        channel = f"events:{kind}"
        
        # Add to in-memory subscribers list
        if channel not in self.subscribers:
            self.subscribers[channel] = []
        
        # Add callback if not already subscribed
        if callback not in self.subscribers[channel]:
            self.subscribers[channel].append(callback)
        
        # Subscribe to Redis channel
        self.pubsub.subscribe(**{channel: self._handle_message})
        
        # Start listener thread if not already running
        if not self.running:
            self.running = True
            self.pubsub_thread = self.pubsub.run_in_thread(sleep_time=0.01)
        
        print(f"Subscribed to events of kind: {kind}")
        return True
    
    def _handle_message(self, message):
        """Internal method to process incoming messages"""
        try:
            channel = message['channel'].decode()
            data = json.loads(message['data'].decode())
            event = Event.from_dict(data)
            
            # Call all subscribers for this channel
            if channel in self.subscribers:
                for callback in self.subscribers[channel]:
                    try:
                        callback(event)
                    except Exception as e:
                        print(f"Error in subscriber callback: {e}")
        except Exception as e:
            print(f"Error handling message: {e}")
    
    def unsubscribe(self, kind: str, callback: Callable[[Event], None] = None) -> bool:
        """
        Unsubscribe from events of a specific kind.
        If callback is provided, only remove that callback.
        If callback is None, remove all callbacks for this kind.
        Returns True if the unsubscription was successful.
        """
        if not self.is_initialized:
            return False
        
        channel = f"events:{kind}"
        
        if channel in self.subscribers:
            if callback:
                # Remove specific callback
                if callback in self.subscribers[channel]:
                    self.subscribers[channel].remove(callback)
            else:
                # Remove all callbacks
                self.subscribers[channel] = []
            
            # If no more callbacks, unsubscribe from Redis channel
            if not self.subscribers[channel]:
                self.pubsub.unsubscribe(channel)
                del self.subscribers[channel]
        
        print(f"Unsubscribed from events of kind: {kind}")
        return True
    
    def close(self):
        """Close all connections"""
        if self.pubsub_thread:
            self.pubsub_thread.stop()
            self.pubsub_thread = None
        
        if self.pubsub:
            self.pubsub.close()
            self.pubsub = None
        
        if self.client:
            self.client.close()
            self.client = None
        
        if self.fact_store:
            self.fact_store.close()
        
        self.running = False
        self.is_initialized = False
        print("EventBroker closed") 