import { useEffect, useState } from 'react';
import {
  createMemberClient,
  createPublicClient,
  getInstanceSlug,
  loadInstanceConfig,
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
  const [unknownLink, setUnknownLink] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadClub() {
      try {
        const config = await loadInstanceConfig(getInstanceSlug());
        const supabase = createPublicClient(config);
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
          } catch (memberError) {
            console.error('Unable to sign in with the personal link:', memberError);
            if (isMounted) setUnknownLink(true);
          }
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
          {unknownLink && <p className="member-greeting" role="alert">This personal link is not recognized.</p>}
        </div>
      </section>
    </main>
  );
}