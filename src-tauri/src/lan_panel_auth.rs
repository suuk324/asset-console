use axum::{
    http::{
        header::{COOKIE, SET_COOKIE},
        HeaderMap, HeaderValue,
    },
    response::Response,
};
use chrono::{Duration, Local};
use rand::{thread_rng, RngCore};

use crate::lan_panel_fs::LanApiError;
use crate::lan_panel_state::{LanPanelSharedState, SessionRecord};

pub const LAN_PANEL_SESSION_COOKIE: &str = "fluxmint_lan_session";
const SESSION_TTL_HOURS: i64 = 8;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanAuthRequest {
    pub code: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanAuthData {
    pub expires_at: String,
}

#[derive(Debug, Clone)]
pub struct SessionValidationResult {
    pub session_id: String,
    pub device_id: String,
}

pub fn clear_sessions(shared: &mut LanPanelSharedState) {
    shared.sessions.clear();
}

pub fn authenticate_with_code(
    shared: &mut LanPanelSharedState,
    code: &str,
    device_id: &str,
) -> Result<LanAuthData, LanApiError> {
    cleanup_expired_sessions(shared);

    let expected_code = shared.access_code.as_deref().ok_or_else(|| {
        LanApiError::workspace_not_ready("No access code is currently available.")
    })?;

    if expected_code != code.trim() {
        return Err(LanApiError::invalid_code("The access code is invalid."));
    }

    let now = Local::now();
    let session_id = generate_session_id();
    let expires_at = now + Duration::hours(SESSION_TTL_HOURS);
    shared.sessions.insert(
        session_id.clone(),
        SessionRecord {
            id: session_id,
            device_id: device_id.to_string(),
            created_at: now,
            last_seen_at: now,
            expires_at,
        },
    );

    Ok(LanAuthData {
        expires_at: expires_at.to_rfc3339(),
    })
}

pub fn apply_auth_cookie(
    response: &mut Response,
    session_id: &str,
    expires_at: chrono::DateTime<Local>,
) -> Result<(), LanApiError> {
    let ttl_seconds = (expires_at - Local::now()).num_seconds().max(0);
    let cookie = format!(
        "{name}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={ttl}",
        name = LAN_PANEL_SESSION_COOKIE,
        value = session_id,
        ttl = ttl_seconds
    );
    let header_value = HeaderValue::from_str(&cookie)
        .map_err(|_| LanApiError::internal("Failed to build the session cookie."))?;
    response.headers_mut().append(SET_COOKIE, header_value);
    Ok(())
}

pub fn resolve_session_from_headers(
    shared: &mut LanPanelSharedState,
    headers: &HeaderMap,
    touch: bool,
) -> Option<SessionValidationResult> {
    cleanup_expired_sessions(shared);
    let session_id = parse_cookie(headers, LAN_PANEL_SESSION_COOKIE)?;
    let session = shared.sessions.get_mut(&session_id)?;

    if session.expires_at <= Local::now() {
        shared.sessions.remove(&session_id);
        return None;
    }

    if touch {
        session.last_seen_at = Local::now();
    }

    Some(SessionValidationResult {
        session_id,
        device_id: session.device_id.clone(),
    })
}

fn cleanup_expired_sessions(shared: &mut LanPanelSharedState) {
    let now = Local::now();
    shared
        .sessions
        .retain(|_, session| session.expires_at > now);
}

fn parse_cookie(headers: &HeaderMap, cookie_name: &str) -> Option<String> {
    let raw_header = headers.get(COOKIE)?.to_str().ok()?;
    for part in raw_header.split(';') {
        let trimmed = part.trim();
        let (name, value) = trimmed.split_once('=')?;
        if name == cookie_name {
            return Some(value.to_string());
        }
    }
    None
}

fn generate_session_id() -> String {
    let mut bytes = [0u8; 32];
    thread_rng().fill_bytes(&mut bytes);
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        let _ = write!(&mut output, "{byte:02x}");
    }
    output
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use axum::http::{header::COOKIE, HeaderMap, HeaderValue};
    use chrono::{Duration, Local};

    use super::{
        authenticate_with_code, parse_cookie, resolve_session_from_headers,
        LAN_PANEL_SESSION_COOKIE,
    };
    use crate::lan_panel_state::{LanPanelSharedState, SessionRecord};

    #[test]
    fn authenticate_with_code_creates_session() {
        let mut shared = LanPanelSharedState {
            access_code: Some("123456".into()),
            ..LanPanelSharedState::default()
        };

        let data = authenticate_with_code(&mut shared, "123456", "dev-1").unwrap();

        assert_eq!(shared.sessions.len(), 1);
        let session = shared.sessions.values().next().unwrap();
        assert_eq!(session.device_id, "dev-1");
        assert!(!data.expires_at.trim().is_empty());
    }

    #[test]
    fn authenticate_with_code_rejects_invalid_code() {
        let mut shared = LanPanelSharedState {
            access_code: Some("123456".into()),
            ..LanPanelSharedState::default()
        };

        let error = authenticate_with_code(&mut shared, "000000", "dev-1").unwrap_err();

        assert_eq!(error.code, "INVALID_CODE");
        assert!(shared.sessions.is_empty());
    }

    #[test]
    fn parse_cookie_returns_matching_value() {
        let mut headers = HeaderMap::new();
        headers.insert(
            COOKIE,
            HeaderValue::from_static("foo=1; fluxmint_lan_session=abc123; bar=2"),
        );

        let parsed = parse_cookie(&headers, LAN_PANEL_SESSION_COOKIE);

        assert_eq!(parsed.as_deref(), Some("abc123"));
    }

    #[test]
    fn resolve_session_from_headers_rejects_expired_session() {
        let mut headers = HeaderMap::new();
        headers.insert(
            COOKIE,
            HeaderValue::from_static("fluxmint_lan_session=expired"),
        );

        let mut shared = LanPanelSharedState {
            sessions: HashMap::from([(
                "expired".into(),
                SessionRecord {
                    id: "expired".into(),
                    device_id: "dev-1".into(),
                    created_at: Local::now() - Duration::hours(10),
                    last_seen_at: Local::now() - Duration::hours(9),
                    expires_at: Local::now() - Duration::minutes(1),
                },
            )]),
            ..LanPanelSharedState::default()
        };

        let result = resolve_session_from_headers(&mut shared, &headers, true);

        assert!(result.is_none());
        assert!(shared.sessions.is_empty());
    }
}
