async function invokeAdmin(client, functionName, params = {}) {
  const { data, error } = await client.rpc(functionName, params);
  if (error) throw error;
  return data;
}

export async function listMembers(client) {
  return invokeAdmin(client, 'admin_list_members');
}

export async function createMember(client, member) {
  const [created] = await invokeAdmin(client, 'admin_create_member', {
    p_name: member.name,
    p_google_email: member.googleEmail || null,
    p_is_player: member.isPlayer,
    p_is_admin: member.isAdmin,
  });
  return created;
}

export async function updateMember(client, member) {
  await invokeAdmin(client, 'admin_update_member', {
    p_member_id: member.id,
    p_name: member.name,
    p_google_email: member.googleEmail || null,
    p_is_player: member.isPlayer,
    p_is_admin: member.isAdmin,
  });
}

export async function regenerateMemberLink(client, memberId) {
  return invokeAdmin(client, 'admin_regenerate_personal_link', {
    p_member_id: memberId,
  });
}

export async function deleteMember(client, memberId) {
  await invokeAdmin(client, 'admin_delete_member', {
    p_member_id: memberId,
  });
}

export async function listSessions(client) {
  await invokeAdmin(client, 'ensure_upcoming_sessions');
  return invokeAdmin(client, 'admin_list_sessions');
}

export async function listPatterns(client) {
  return invokeAdmin(client, 'admin_list_patterns');
}

export async function createPattern(client, pattern) {
  return invokeAdmin(client, 'admin_create_pattern', {
    p_day_of_week: pattern.day,
    p_time: pattern.time,
    p_duration_minutes: pattern.durationMinutes,
    p_location: pattern.location,
    p_min_players: pattern.minPlayers,
  });
}

export async function updatePattern(client, pattern) {
  await invokeAdmin(client, 'admin_update_pattern', {
    p_pattern_id: pattern.id,
    p_day_of_week: pattern.day,
    p_time: pattern.time,
    p_duration_minutes: pattern.durationMinutes,
    p_location: pattern.location,
    p_min_players: pattern.minPlayers,
  });
}

export async function createSession(client, session) {
  return invokeAdmin(client, 'admin_create_session', {
    p_local_date: session.date,
    p_start_time: session.time,
    p_duration: `${session.durationMinutes} minutes`,
    p_location: session.location,
    p_event_description: session.description || null,
    p_event_type: session.type,
    p_min_players: session.minPlayers,
  });
}

export async function updateSession(client, sessionId, { time, location, minPlayers }) {
  await invokeAdmin(client, 'admin_update_session', {
    p_session_id: sessionId,
    p_start_time: time,
    p_location: location,
    p_min_players: minPlayers,
  });
}

export async function setSessionCancelled(client, sessionId, cancelled, reason = null) {
  await invokeAdmin(client, 'admin_set_session_cancelled', {
    p_session_id: sessionId,
    p_cancelled: cancelled,
    p_reason: reason,
  });
}

export async function addExceptionalPlayer(client, sessionId, name) {
  return invokeAdmin(client, 'admin_add_exceptional_player', {
    p_session_id: sessionId,
    p_name: name,
  });
}

export async function removeExceptionalPlayer(client, playerId) {
  await invokeAdmin(client, 'admin_remove_exceptional_player', {
    p_player_id: playerId,
  });
}
