import { useEffect, useState } from 'react';
import { createSupabaseClientForInstance, getInstanceSlug } from './supabaseClient';
import './App.css';

export default function App() {
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadClub() {
      try {
        const instanceSlug = getInstanceSlug();
        const supabase = await createSupabaseClientForInstance(instanceSlug);
        const { data, error } = await supabase
          .from('clubs')
          .select('name, banner_message')
          .limit(1)
          .maybeSingle();

        if (!isMounted) return;

        if (error || !data) throw error || new Error('Club row was not found.');

        setClub(data);
        document.title = data.name;
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
        </div>
      </section>
    </main>
  );
}