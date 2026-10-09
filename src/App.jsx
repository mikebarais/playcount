import { useEffect, useState } from 'react';
import {
  createMemberClient,
  createPublicClient,
  getInstanceSlug,
  getPersonalPagePath,
  loadInstanceConfig,
  signInWithGoogle,
} from './supabaseClient';
import './App.css';

const personalLinkPattern = /^\/p\/([^/]+)\/?$/;

function getPersonalLink(pathname = window.location.pathname) {
  const match = pathname.match(personalLinkPattern);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export default function App() {
  const [club, setClub] = useState(null);
  const [memberName, setMemberName] = useState(null);
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
          .select('name, banner_message')
          .limit(1)
          .maybeSingle();

        if (!isMounted) return;

        if (error || !data) throw error || new Error('Club row was not found.');

        setClub(data);
        document.title = data.name;

        const personalLink = getPersonalLink();
        if (personalLink) {
          try {
            const memberClient = await createMemberClient(config, personalLink);
            const { data: member, error: memberError } = await memberClient
              .from('members')
              .select('name')
              .single();

            if (memberError) throw memberError;
            if (isMounted) setMemberName(member.name);
            return;
          } catch (memberError) {
            // An unrecognized link falls back to Google sign-in.
            console.error('Unable to sign in with the personal link:', memberError);
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
          setMemberName(member.name);
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
      <section className="club-banner" aria-labelledby="club-title">
        <div className="banner-shape" aria-hidden="true" />
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
    </main>
  );
}