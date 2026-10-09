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

export async function setMemberActive(client, memberId, isActive) {
  await invokeAdmin(client, 'admin_set_member_active', {
    p_member_id: memberId,
    p_is_active: isActive,
  });
}
