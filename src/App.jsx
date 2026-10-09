import { useEffect, useState } from 'react';
import {
  createMemberClient,
  createPublicClient,
  getInstanceSlug,
  getPersonalPagePath,
  loadInstanceConfig,
  signInWithGoogle,
} from './supabaseClient';
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
    .select('id, starts_at, duration, location, event_name, event_type, status, cancellation_reason')
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
          setMember({ id: row.id, client: memberClient });
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
              .select('id, name')
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
          .select('id, name, personal_link')
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
    const status = isPresent ? 'Présent' : 'Absent';

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
        className={memberName ? 'club-banner club-banner-compact' : 'club-banner'}
        aria-labelledby="club-title"
      >
        <div className="banner-shape" aria-hidden="true" />
        {memberName && club.logoUrl && (
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
                <button type="button" className="sign-in-button" onClick={handleGoogleSignIn}>
                  Sign in with Google
                </button>
              )}
              {signInFailed && <p role="alert">Google sign-in could not be started.</p>}
            </div>
          )}
        </div>
      </section>
      {memberName && (
        <section className="sessions" aria-labelledby="sessions-title">
          <h2 id="sessions-title">Upcoming sessions</h2>
          {sessionsError && <p role="alert">Sessions are unavailable.</p>}
          {saveFailed && <p role="alert">Your attendance could not be saved.</p>}
          {!sessionsError && !board && <p role="status">Loading sessions</p>}
          {board && <AttendanceMatrix board={board} memberId={member.id} onToggle={handleToggle} />}
        </section>
      )}
    </main>
  );
}