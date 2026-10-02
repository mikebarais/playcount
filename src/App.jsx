import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Check, X, HelpCircle, Users, Calendar, MapPin, Shield } from 'lucide-react';

export default function App() {
  const [club, setClub] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [player, setPlayer] = useState(null);
  const [responses, setResponses] = useState([]);
  const [currentResponse, setCurrentResponse] = useState(null);
  const [loading, setLoading] = useState(true);

  // Extract params from URL
  const urlParams = new URLSearchParams(window.location.search);
  const clubSlug = urlParams.get('club') || 'lamanchette';
  const playerToken = urlParams.get('token') || 'admin-token-12345';

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    try {
      setLoading(true);

      // 1. Fetch club info
      const { data: clubData } = await supabase
        .from('clubs')
        .select('*')
        .eq('slug', clubSlug)
        .maybeSingle();

      if (clubData) {
        setClub(clubData);

        // 2. Fetch schedule info
        const { data: scheduleData } = await supabase
          .from('schedules')
          .select('*')
          .eq('club_id', clubData.id)
          .maybeSingle();

        if (scheduleData) setSchedule(scheduleData);
      }

      // 3. Fetch player by token
      if (playerToken) {
        const { data: playerData } = await supabase
          .from('players')
          .select('*')
          .eq('token_link', playerToken)
          .maybeSingle();

        if (playerData) setPlayer(playerData);
      }

      // 4. Fetch all responses
      const { data: responsesData } = await supabase
        .from('responses')
        .select('*, players(name)');

      if (responsesData) {
        setResponses(responsesData);
        if (playerToken) {
          const myResp = responsesData.find(r => r.players?.token_link === playerToken);
          if (myResp) setCurrentResponse(myResp);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleResponse(status) {
    if (!player) return;

    const activeSessionId = schedule?.id || null;

    const newResponse = {
      session_id: activeSessionId,
      player_id: player.id,
      status,
      updated_at: new Date().toISOString()
    };

    // Dacă există deja un răspuns pentru acest jucător, îi refolosim ID-ul
    if (currentResponse?.id) {
      newResponse.id = currentResponse.id;
    }

    setCurrentResponse(newResponse);

    // Salvare / Actualizare în Supabase
    const { error } = await supabase
      .from('responses')
      .upsert(newResponse, { onConflict: 'player_id' });

    if (error) {
      console.error('Error saving response:', error);
    } else {
      fetchInitialData();
    }
  }

  const totalAttendees = (responses || []).filter(r => r?.status === 'yes').length;
  const minRequired = club?.min_players || 8;
  const isTargetMet = totalAttendees >= minRequired;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-slate-400">
        Chargement de PlayCount...
      </div>
    );
  }

  return (
    <main className="max-w-md mx-auto p-4 pb-12 space-y-6">
      {/* Header section */}
      <header className="text-center space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-semibold">
          <Shield className="w-3.5 h-3.5" />
          {club?.name || 'La Manchette'}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Prochain Entraînement
        </h1>
      </header>

      {/* Banner message if set by admin */}
      {club?.banner_message && (
        <section className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-amber-300 text-sm">
          {club.banner_message}
        </section>
      )}

      {/* Event Details */}
      <section className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3 text-slate-300 text-sm">
          <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Samedi à 10:00 AM</span>
        </div>
        <div className="flex items-center gap-3 text-slate-300 text-sm">
          <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{schedule?.default_location || 'Blocry Gym Hall G3'}</span>
        </div>
      </section>

      {/* Counter */}
      <section className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Joueurs confirmés
          </span>
          <span className={`font-bold ${isTargetMet ? 'text-emerald-400' : 'text-amber-400'}`}>
            {totalAttendees} / {minRequired} min
          </span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${
              isTargetMet ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min((totalAttendees / minRequired) * 100, 100)}%` }}
          />
        </div>
      </section>

      {/* Voting Buttons */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase font-bold tracking-wider text-slate-400">
          VOTRE PRÉSENCE ({player?.name || 'JOUEUR'})
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleResponse('yes')}
            className={`p-3 rounded-xl border font-medium text-sm flex flex-col items-center gap-1.5 transition-all ${
              currentResponse?.status === 'yes'
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                : 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Check className="w-5 h-5" />
            Présent
          </button>

          <button
            onClick={() => handleResponse('maybe')}
            className={`p-3 rounded-xl border font-medium text-sm flex flex-col items-center gap-1.5 transition-all ${
              currentResponse?.status === 'maybe'
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <HelpCircle className="w-5 h-5" />
            Incertain
          </button>

          <button
            onClick={() => handleResponse('no')}
            className={`p-3 rounded-xl border font-medium text-sm flex flex-col items-center gap-1.5 transition-all ${
              currentResponse?.status === 'no'
                ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                : 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
            Absent
          </button>
        </div>
      </section>

      {/* Roster List */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase font-bold tracking-wider text-slate-400">
          LISTE DES PARTICIPANTS
        </h2>
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl divide-y divide-slate-700/40 overflow-hidden">
          {responses.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              Aucune réponse pour le moment.
            </div>
          ) : (
            responses.map((resp, idx) => (
              <div key={idx} className="p-3 flex justify-between items-center text-sm">
                <span className="text-slate-200 font-medium">
                  {resp.players?.name || 'Joueur Anonyme'}
                </span>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                    resp.status === 'yes'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : resp.status === 'maybe'
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-rose-500/10 text-rose-400'
                  }`}
                >
                  {resp.status === 'yes'
                    ? 'Présent'
                    : resp.status === 'maybe'
                    ? 'Incertain'
                    : 'Absent'}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
