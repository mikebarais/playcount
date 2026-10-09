import { useEffect, useState } from 'react';
import {
  createMemberClient,
  createPublicClient,
  getInstanceSlug,
  getPersonalPagePath,
  loadInstanceConfig,
  signInWithGoogle,
} from './supabaseClient';
import AdminPanel from './AdminPanel';
import AttendanceMatrix from './AttendanceMatrix';
import './App.css';

const personalLinkPattern = /^\/p\/([^/]+)\/?$/;
const sessionWindowDays = 28;
const maxSessions = 6;
const themeKeys = ['page', 'banner', 'text', 'accent', 'shape', 'rule'];
const hexColorPattern = /^#[0-9a-f]{6}$/i;

function applyTheme(theme) {
  for (const key of themeKeys) {
    const value = theme?.[key];
    if (typeof value === 'string' && hexColorPattern.test(value)) {
      document.documentElement.style.setProperty(`--color-${key}`, value);
    }
  }
}

function getPersonalLink(pathname = window.location.pathname) {
  const match = pathname.match(personalLinkPattern);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function loadAttendanceBoard(memberClient) {
  const { error: generateError } = await memberClient.rpc('ensure_upcoming_sessions');
  if (generateError) throw generateError;

  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + sessionWindowDays);

  const { data: sessions, error } = await memberClient
    .from('sessions')
    .select('id, starts_at, duration, location, event_name, event_type, status, cancellation_reason, min_players, schedule_patterns(min_players)')
    .gte('starts_at', windowStart.toISOString())
    .lt('starts_at', windowEnd.toISOString())
    .order('starts_at')
    .limit(maxSessions);

  if (error) throw error;

  const sessionIds = sessions.map((session) => session.id);
  const [players, attendances, guests] = await Promise.all([
    memberClient.rpc('club_players'),
    memberClient.from('attendances').select('session_id, member_id, status').in('session_id', sessionIds),
    memberClient.from('exceptional_players').select('id, session_id, name').in('session_id', sessionIds).order('name'),
  ]);

  for (const result of [players, attendances, guests]) {
    if (result.error) throw result.error;
  }

  return { sessions, players: players.data, attendances: attendances.data, guests: guests.data };
}

export default function App() {
  const [club, setClub] = useState(null);
  const [memberName, setMemberName] = useState(null);
  const [member, setMember] = useState(null);
  const [activeArea, setActiveArea] = useState('attendance');
  const [board, setBoard] = useState(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [authClient, setAuthClient] = useState(null);
  const [unregisteredEmail, setUnregisteredEmail] = useState(null);
  const [signInFailed, setSignInFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadClub() {
      try {
        const config = await loadInstanceConfig(getInstanceSlug());
        const supabase = createPublicClient(config);
        setAuthClient(supabase);
        const { data, error } = await supabase
          .from('clubs')
          .select('name, banner_message, theme, logo_path')
          .limit(1)
          .maybeSingle();

        if (!isMounted) return;

        if (error || !data) throw error || new Error('Club row was not found.');

        setClub({
          ...data,
          logoUrl: data.logo_path
            ? supabase.storage.from('branding').getPublicUrl(data.logo_path).data.publicUrl
            : null,
        });
        applyTheme(data.theme);
        document.title = data.name;

        async function showMember(memberClient, row) {
          if (!isMounted) return;
          setMemberName(row.name);
          setMember({ id: row.id, client: memberClient, isAdmin: row.is_admin });
          try {
            const loadedBoard = await loadAttendanceBoard(memberClient);
            if (isMounted) setBoard(loadedBoard);
          } catch (sessionsLoadError) {
            console.error('Unable to load sessions:', sessionsLoadError);
            if (isMounted) setSessionsError(true);
          }
        }

        const personalLink = getPersonalLink();
        if (personalLink) {
          let memberClient;
          let member;
          try {
            memberClient = await createMemberClient(config, personalLink);
            const { data: row, error: memberError } = await memberClient
              .from('members')
              .select('id, name, is_admin')
              .single();

            if (memberError) throw memberError;
            member = row;
          } catch (memberError) {
            // An unrecognized link falls back to Google sign-in.
            console.error('Unable to sign in with the personal link:', memberError);
          }

          if (member) {
            await showMember(memberClient, member);
            return;
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: member, error: memberError } = await supabase
          .from('members')
          .select('id, name, personal_link, is_admin')
          .maybeSingle();

        if (memberError) throw memberError;
        if (!isMounted) return;

        if (member) {
          window.history.replaceState(null, '', getPersonalPagePath(member.personal_link));
          // Session data is accessed with the member's own identity, as with a personal link.
          await showMember(await createMemberClient(config, member.personal_link), member);
        } else {
          setUnregisteredEmail(session.user.email);
        }
      } catch (error) {
        console.error('Unable to load club branding:', error);
        if (isMounted) setLoadError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadClub();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleGoogleSignIn() {
    setSignInFailed(false);
    const { error } = await signInWithGoogle(authClient);
    if (error) {
      console.error('Google sign-in failed:', error);
      setSignInFailed(true);
    }
  }

  async function handleSignOut() {
    await authClient.auth.signOut();
    setUnregisteredEmail(null);
  }

  function setOwnAttendance(sessionId, status) {
    setBoard((current) => ({
      ...current,
      attendances: [
        ...current.attendances.filter(
          (attendance) => !(attendance.session_id === sessionId && attendance.member_id === member.id),
        ),
        { session_id: sessionId, member_id: member.id, status },
      ],
    }));
  }

  async function handleToggle(sessionId, isPresent) {
    const previous = board.attendances.find(
      (attendance) => attendance.session_id === sessionId && attendance.member_id === member.id,
    );
    const status = isPresent ? 'present' : 'absent';

    setSaveFailed(false);
    setOwnAttendance(sessionId, status);

    const { error } = await member.client
      .from('attendances')
      .upsert({ session_id: sessionId, member_id: member.id, status });

    if (error) {
      console.error('Unable to save attendance:', error);
      setOwnAttendance(sessionId, previous?.status ?? null);
      setSaveFailed(true);
    }
  }

  if (loading) {
    return <main className="page-shell" aria-busy="true"><p role="status">Loading</p></main>;
  }

  if (loadError || !club) {
    return <main className="page-shell"><p role="alert">Club information is unavailable.</p></main>;
  }

  return (
    <main className="page-shell">
      <section
        className={memberName ? 'club-banner club-banner-compact' : 'club-banner club-banner-login'}
        aria-labelledby="club-title"
      >
        <div className="banner-shape" aria-hidden="true" />
        {club.logoUrl && (
          <img className="club-logo" src={club.logoUrl} alt={`${club.name} logo`} />
        )}
        <div className="banner-content">
          {club.banner_message && <p className="banner-message">{club.banner_message}</p>}
          <h1 id="club-title">{club.name}</h1>
          <div className="banner-rule" aria-hidden="true" />
          {memberName && <p className="member-greeting">Hello, {memberName}</p>}
          {!memberName && (
            <div className="sign-in">
              {unregisteredEmail ? (
                <>
                  <p role="alert">{unregisteredEmail} is not registered as a member.</p>
                  <button type="button" className="sign-in-button" onClick={handleSignOut}>
                    Use another account
                  </button>
                </>
              ) : (
                <button type="button" className="sign-in-button google-sign-in-button" onClick={handleGoogleSignIn}>
                  <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z" />
                    <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8V33A20 20 0 0 0 24 44Z" />
                    <path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.4H5.8a20 20 0 0 0 0 18l6.8-5.4Z" />
                    <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8A19.5 19.5 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.4C14.2 15.6 18.7 12 24 12Z" />
                  </svg>
                  Sign in with Google
                </button>
              )}
              {signInFailed && <p role="alert">Google sign-in could not be started.</p>}
            </div>
          )}
        </div>
      </section>
      {member?.isAdmin && (
        <nav className="area-tiles" aria-label="Member areas">
          <button
            type="button"
            className={activeArea === 'attendance' ? 'area-tile is-selected' : 'area-tile'}
            aria-current={activeArea === 'attendance' ? 'page' : undefined}
            onClick={() => setActiveArea('attendance')}
          >
            Attendance
          </button>
          <button
            type="button"
            className={activeArea === 'administration' ? 'area-tile is-selected' : 'area-tile'}
            aria-current={activeArea === 'administration' ? 'page' : undefined}
            onClick={() => setActiveArea('administration')}
          >
            Administration
          </button>
        </nav>
      )}
      {memberName && (
        activeArea === 'administration' && member?.isAdmin ? (
          <AdminPanel
            client={member.client}
            currentMemberId={member.id}
          />
        ) : <section className="sessions" aria-labelledby="sessions-title">
          <h2 id="sessions-title">Upcoming sessions</h2>
          {sessionsError && <p role="alert">Sessions are unavailable.</p>}
          {saveFailed && (
            <div role="alert">
              <p>Your attendance could not be saved. Reload the page to get a fresh session, then try again.</p>
              <button type="button" onClick={() => window.location.reload()}>Reload page</button>
            </div>
          )}
          {!sessionsError && !board && <p role="status">Loading sessions</p>}
          {board && <AttendanceMatrix board={board} memberId={member.id} onToggle={handleToggle} />}
        </section>
      )}
    </main>
  );
}