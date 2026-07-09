use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: Option<String>,
    pub title: String,
    pub body: String,
    pub notification_type: NotificationType,
    pub priority: NotificationPriority,
    pub timeout: NotificationTimeout,
    pub icon: Option<String>,
    pub sound: bool,
    pub actions: Vec<NotificationAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationType {
    RecordingStarted,
    RecordingStopped,
    RecordingPaused,
    RecordingResumed,
    TranscriptionComplete,
    MeetingReminder(u64), // Duration in minutes
    SystemError(String),
    Test, // For testing notifications
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationPriority {
    Low,
    Normal,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationTimeout {
    Never,
    Seconds(u64),
    Default,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationAction {
    pub id: String,
    pub title: String,
    pub action_type: NotificationActionType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationActionType {
    Button,
    Reply,
}

impl Notification {
    pub fn new(title: impl Into<String>, body: impl Into<String>, notification_type: NotificationType) -> Self {
        Self {
            id: None,
            title: title.into(),
            body: body.into(),
            notification_type,
            priority: NotificationPriority::Normal,
            timeout: NotificationTimeout::Default,
            icon: None,
            sound: true,
            actions: vec![],
        }
    }

    pub fn with_priority(mut self, priority: NotificationPriority) -> Self {
        self.priority = priority;
        self
    }

    pub fn with_timeout(mut self, timeout: NotificationTimeout) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn with_sound(mut self, sound: bool) -> Self {
        self.sound = sound;
        self
    }

    pub fn with_icon(mut self, icon: impl Into<String>) -> Self {
        self.icon = Some(icon.into());
        self
    }

    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    pub fn add_action(mut self, action: NotificationAction) -> Self {
        self.actions.push(action);
        self
    }
}

impl Default for NotificationPriority {
    fn default() -> Self {
        NotificationPriority::Normal
    }
}

impl Default for NotificationTimeout {
    fn default() -> Self {
        NotificationTimeout::Default
    }
}

// Helper functions for creating common notifications
impl Notification {
    pub fn recording_started(meeting_name: Option<String>) -> Self {
        let body = match meeting_name {
            Some(name) => format!("Grabación iniciada para la reunión: {}", name),
            None => "La grabación ha comenzado. Informa a los demás participantes de que estás grabando.".to_string(),
        };

        Notification::new("MinutIA", body, NotificationType::RecordingStarted)
            .with_priority(NotificationPriority::High)
            .with_timeout(NotificationTimeout::Seconds(5))
    }

    pub fn recording_stopped() -> Self {
        Notification::new(
            "MinutIA",
            "La grabación se ha detenido y guardado",
            NotificationType::RecordingStopped
        )
        .with_priority(NotificationPriority::Normal)
        .with_timeout(NotificationTimeout::Seconds(3))
    }

    pub fn recording_paused() -> Self {
        Notification::new(
            "MinutIA",
            "La grabación está en pausa",
            NotificationType::RecordingPaused
        )
        .with_priority(NotificationPriority::Normal)
        .with_timeout(NotificationTimeout::Seconds(3))
    }

    pub fn recording_resumed() -> Self {
        Notification::new(
            "MinutIA",
            "La grabación se ha reanudado",
            NotificationType::RecordingResumed
        )
        .with_priority(NotificationPriority::Normal)
        .with_timeout(NotificationTimeout::Seconds(3))
    }

    pub fn transcription_complete(file_path: Option<String>) -> Self {
        let body = match file_path {
            Some(path) => format!("Transcripción completada y guardada en: {}", path),
            None => "La transcripción ha finalizado".to_string(),
        };

        Notification::new("MinutIA", body, NotificationType::TranscriptionComplete)
            .with_priority(NotificationPriority::Normal)
            .with_timeout(NotificationTimeout::Seconds(5))
    }

    pub fn meeting_reminder(minutes_until: u64, meeting_title: Option<String>) -> Self {
        let body = match meeting_title {
            Some(title) => format!("La reunión '{}' comienza en {} minutos", title, minutes_until),
            None => format!("La reunión comienza en {} minutos", minutes_until),
        };

        Notification::new("MinutIA", body, NotificationType::MeetingReminder(minutes_until))
            .with_priority(NotificationPriority::High)
            .with_timeout(NotificationTimeout::Seconds(10))
    }

    pub fn system_error(error: impl Into<String>) -> Self {
        let error_string = error.into();
        Notification::new(
            "Error de MinutIA",
            error_string.clone(),
            NotificationType::SystemError(error_string)
        )
        .with_priority(NotificationPriority::Critical)
        .with_timeout(NotificationTimeout::Never)
    }

    pub fn test_notification() -> Self {
        Notification::new(
            "MinutIA",
            "Esta es una notificación de prueba para verificar que el sistema funciona correctamente",
            NotificationType::Test
        )
        .with_priority(NotificationPriority::Normal)
        .with_timeout(NotificationTimeout::Seconds(5))
    }
}