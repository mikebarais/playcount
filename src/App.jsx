import { useEffect, useState } from 'react';
import {
  createMemberClient,
  createPublicClient,
  getInstanceSlug,
  getPersonalPagePath,
  loadInstanceConfig,
  signInWithGoogle,
} from './supabaseClient';
import SessionList from './SessionList';
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

async function loadUpcomingSessions(memberClient) {
  const { error: generateError } = await memberClient.rpc('ensure_upcoming_sessions');
  if (generateError) throw generateError;

  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + sessionWindowDays);

  const { data, error } = await memberClient
    .from('sessions')
    .select('id, starts_at, duration, location, event_name, event_type, status, cancellation_reason')
    .gte('starts_at', windowStart.toISOString())
    .lt('starts_at', windowEnd.toISOString())
    .order('starts_at')
    .limit(maxSessions);

  if (error) throw error;
  return data;
}

export default function App() {
  const [club, setClub] = useState(null);
  const [memberName, setMemberName] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [sessionsError, setSessionsError] = useState(false);
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

        async function showMember(memberClient, name) {
          if (!isMounted) return;
          setMemberName(name);
          try {
            const upcoming = await loadUpcomingSessions(memberClient);
            if (isMounted) setSessions(upcoming);
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
              .select('name')
              .single();

            if (memberError) throw memberError;
            member = row;
          } catch (memberError) {
            // An unrecognized link falls back to Google sign-in.
            console.error('Unable to sign in with the personal link:', memberError);
          }

          if (member) {
            await showMember(memberClient, member.name);
            return;
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: member, error: memberError } = await supabase
          .from('members')
          .select('name, personal_link')
          .maybeSingle();

        if (memberError) throw memberError;
        if (!isMounted) return;

        if (member) {
          window.history.replaceState(null, '', getPersonalPagePath(member.personal_link));
          // Session data is accessed with the member's own identity, as with a personal link.
          await showMember(await createMemberClient(config, member.personal_link), member.name);
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
          {!sessionsError && !sessions && <p role="status">Loading sessions</p>}
          {sessions && <SessionList sessions={sessions} />}
        </section>
      )}
    </main>
  );
}