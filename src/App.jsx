import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  Users, Calendar, MapPin, AlertCircle, CheckCircle, 
  XCircle, HelpCircle, Plus, Trash2, ShieldCheck, Globe
} from 'lucide-react';
import { fr } from './locales/fr';
import { en } from './locales/en';

const translations = { fr, en };

export default function App() {
  const [lang, setLang] = useState('fr');
  const t = translations[lang] || translations.fr;

  const [clubSlug, setClubSlug] = useState('lamanchette');
  const [playerToken, setPlayerToken] = useState(null);
  
  const [club, setClub] = useState(null);
  const [player, setPlayer] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [responses, setResponses] = useState({});
  const [exceptionalParticipants, setExceptionalParticipants] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const slugParam = searchParams.get('club') || 'lamanchette';
    const tokenParam = searchParams.get('token');
    const langParam = searchParams.get('lang') || 'fr';
    
    setClubSlug(slugParam);
    setPlayerToken(tokenParam);
    if (translations[langParam]) setLang(langParam);
    
    fetchData(slugParam, tokenParam);
  }, []);

  const fetchData = async (slug, token) => {
    setLoading(true);
    try {
      const { data: clubData, error: clubErr } = await supabase
        .from('clubs')
        .select('*')
        .eq('slug', slug)
        .single();
        
      if (clubErr || !clubData) {
        console.error('Club not found:', clubErr);
        setLoading(false);
        return;
      }
      setClub(clubData);

      if (token) {
        const { data: playerData } = await supabase
          .from('players')
          .select('*')
          .eq('club_id', clubData.id)
          .eq('token_link', token)
          .single();
        if (playerData) setPlayer(playerData);
      }

      const { data: sessionsData } = await supabase
        .from('sessions')
        .select('*')
        .eq('club_id', clubData.id)
        .order('date_time', { ascending: true });
      setSessions(sessionsData || []);

      const sessionIds = (sessionsData || []).map(s => s.id);

      if (sessionIds.length > 0) {
        const { data: responsesData } = await supabase
          .from('responses')
          .select('*')
          .in('session_id', sessionIds);
        
        const respMap = {};
        (responsesData || []).forEach(r => {
          respMap[`${r.session_id}_${r.player_id}`] = r;
        });
        setResponses(respMap);

        const { data: excData } = await supabase
          .from('exceptional_participants')
          .select('*')
          .in('session_id', sessionIds);
        setExceptionalParticipants(excData || []);
      }

      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('club_id', clubData.id)
        .eq('is_active', true);
      setAllPlayers(playersData || []);

    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (sessionId, status) => {
    if (!player) return;

    const currentResp = responses[`${sessionId}_${player.id}`];
    
    if (currentResp) {
      const { data, error } = await supabase
        .from('responses')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', currentResp.id)
        .select()
        .single();

      if (!error && data) {
        setResponses(prev => ({ ...prev, [`${sessionId}_${player.id}`]: data }));
      }
    } else {
      const { data, error } = await supabase
        .from('responses')
        .insert({
          session_id: sessionId,
          player_id: player.id,
          status
        })
        .select()
        .single();

      if (!error && data) {
        setResponses(prev => ({ ...prev, [`${sessionId}_${player.id}`]: data }));
      }
    }
  };

  const handleAddExceptional = async (sessionId) => {
    if (!newParticipantName.trim()) return;

    const { data, error } = await supabase
      .from('exceptional_participants')
      .insert({
        session_id: sessionId,
        name: newParticipantName.trim()
      })
      .select()
      .single();

    if (!error && data) {
      setExceptionalParticipants(prev => [...prev, data]);
      setNewParticipantName('');
    }
  };

  const handleRemoveExceptional = async (id) => {
    const { error } = await supabase
      .from('exceptional_participants')
      .delete()
      .eq('id', id);

    if (!error) {
      setExceptionalParticipants(prev => prev.filter(item => item.id !== id));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-slate-400">
        {t.errors.loading}
      </div>
    );
  }

  if (!club) {
    return (
      <div className="p-8 text-center text-white bg-slate-900 min-h-screen flex flex-col items-center justify-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
        <h1 className="text-xl font-bold">{t.errors.notFound}</h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-12">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-wide">{club.name}</h1>
          {player && <p className="text-xs text-indigo-400 font-medium">{t.header.player}: {player.name}</p>}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Language Switcher */}
          <button 
            onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 text-slate-300 hover:bg-slate-600 transition"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="uppercase">{lang}</span>
          </button>

          {/* Admin Toggle */}
          <button 
            onClick={() => setIsAdmin(!isAdmin)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              isAdmin ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-700 text-slate-300'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            {isAdmin ? t.header.adminMode : t.header.admin}
          </button>
        </div>
      </header>

      {/* Announcement Banner */}
      {club.banner_message && (
        <div className="bg-indigo-600/20 border-b border-indigo-500/30 px-4 py-3 text-sm text-indigo-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-indigo-400" />
          <span>{club.banner_message}</span>
        </div>
      )}

      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Admin Matrix View */}
        {isAdmin && (
          <section className="bg-slate-800 rounded-xl p-4 border border-slate-700 overflow-hidden">
            <h2 className="text-md font-bold mb-3 text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" /> {t.matrix.title}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse min-w-[300px]">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="py-2 pr-2">{t.matrix.playerHeader}</th>
                    {sessions.map(s => (
                      <th key={s.id} className="py-2 px-2 text-center whitespace-nowrap">
                        {new Date(s.date_time).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {allPlayers.map(p => (
                    <tr key={p.id}>
                      <td className="py-2 pr-2 font-medium text-slate-300">{p.name}</td>
                      {sessions.map(s => {
                        const status = responses[`${s.id}_${p.id}`]?.status;
                        return (
                          <td key={s.id} className="py-2 px-2 text-center">
                            {status === 'yes' && <span className="text-emerald-400 font-bold">{t.status.present}</span>}
                            {status === 'maybe' && <span className="text-amber-400 font-bold">{t.status.uncertain}</span>}
                            {status === 'no' && <span className="text-rose-400 font-bold">{t.status.absent}</span>}
                            {!status && <span className="text-slate-600">-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Sessions List */}
        {sessions.map(session => {
          const sessionExceptional = exceptionalParticipants.filter(e => e.session_id === session.id);
          
          const yesCount = Object.values(responses).filter(
            r => r.session_id === session.id && r.status === 'yes'
          ).length;

          const totalHeadcount = yesCount + sessionExceptional.length;
          const isViable = totalHeadcount >= club.min_players;
          const myResponse = player ? responses[`${session.id}_${player.id}`]?.status : null;

          return (
            <div key={session.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
              <div className="p-4 border-b border-slate-700/60">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {new Date(session.date_time).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
                {session.location && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{session.location}</span>
                  </div>
                )}
              </div>

              {/* Headcount Viability */}
              <div className="p-4 bg-slate-800/50 border-b border-slate-700/60">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="text-slate-300 font-medium">
                    {t.session.totalConfirmed}: <strong className="text-white text-sm">{totalHeadcount}</strong> / {club.min_players}
                  </span>
                  <span className={`font-bold px-2 py-0.5 rounded ${isViable ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {isViable ? t.status.confirmed : t.status.pending}
                  </span>
                </div>
                <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${isViable ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, (totalHeadcount / club.min_players) * 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* Voting Options */}
              {player && (
                <div className="p-4 border-b border-slate-700/60">
                  <p className="text-xs text-slate-400 mb-2 font-medium">{t.session.yourAttendance}:</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleVote(session.id, 'yes')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-bold transition ${
                        myResponse === 'yes' 
                          ? 'bg-emerald-600 text-white border-emerald-500' 
                          : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <CheckCircle className="w-4 h-4 mb-1" />
                      {t.status.present}
                    </button>
                    <button
                      onClick={() => handleVote(session.id, 'maybe')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-bold transition ${
                        myResponse === 'maybe' 
                          ? 'bg-amber-600 text-white border-amber-500' 
                          : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <HelpCircle className="w-4 h-4 mb-1" />
                      {t.status.uncertain}
                    </button>
                    <button
                      onClick={() => handleVote(session.id, 'no')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-bold transition ${
                        myResponse === 'no' 
                          ? 'bg-rose-600 text-white border-rose-500' 
                          : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <XCircle className="w-4 h-4 mb-1" />
                      {t.status.absent}
                    </button>
                  </div>
                </div>
              )}

              {/* Exceptional Participants Section (Admin) */}
              {isAdmin && (
                <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 space-y-3">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">{t.session.exceptionalTitle}</p>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={t.session.addPlaceholder}
                      value={newParticipantName}
                      onChange={(e) => setNewParticipantName(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={() => handleAddExceptional(session.id)}
                      className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t.session.addButton}
                    </button>
                  </div>

                  {sessionExceptional.length > 0 && (
                    <ul className="space-y-1.5">
                      {sessionExceptional.map(exc => (
                        <li key={exc.id} className="flex justify-between items-center bg-slate-900/60 px-2.5 py-1.5 rounded text-xs">
                          <span className="text-slate-300 font-medium">{exc.name} <span className="text-amber-400/80 text-[10px]">({t.session.exceptionalLabel})</span></span>
                          <button 
                            onClick={() => handleRemoveExceptional(exc.id)}
                            className="text-rose-400 hover:text-rose-300 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

            </div>
          );
        })}
      </main>
    </div>
  );
}
