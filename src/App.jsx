import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Check, X, HelpCircle, UserPlus, Users, Calendar, MapPin, Shield } from 'lucide-react';

export default function App() {
  const [club, setClub] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [player, setPlayer] = useState(null);
  const [responses, setResponses] = useState([]);
  const [currentResponse, setCurrentResponse] = useState(null);
  const [loading, setLoading] = useState(true);

  // Extract club slug and player token from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const clubSlug = urlParams.get('club') || 'lamanchette';
  const playerToken = urlParams.get('token') || 'manchette-admin-token-123';

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
        .single();
      
      if (clubData) setClub(clubData);

      // 2. Fetch schedule info
      const { data: scheduleData } = await supabase
        .from('schedules')
        .select('*')
        .eq('club_id', clubData?.id)
        .single();
      
      if (scheduleData) setSchedule(scheduleData);

      // 3. Fetch player by token
      const { data: playerData } = await supabase
        .from('players')
        .select('*')
        .eq('token_link', playerToken)
        .single();

      if (playerData) setPlayer(playerData);

      // 4. Fetch all responses for the active session
      const { data: responsesData } = await supabase
        .from('responses')
        .select('*, players(name)');
      
      if (responsesData) {
        setResponses(responsesData);
        const myResp = responsesData.find(r => r.player_id === playerData?.id);
        if (myResp) setCurrentResponse(myResp);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleResponse(status, guests = 0) {
    if (!player) return;

    const newResponse = {
      player_id: player.id,
      status,
      guests,
      updated_at: new Date().toISOString()
    };

    setCurrentResponse(newResponse);

    // Save response to Supabase
    const { error } = await supabase
      .from('responses')
      .upsert(newResponse, { onConflict: 'session_id,player_id' });

    if (error) {
      console.error('Error saving response:', error);
    } else {
      fetchInitialData();
    }
  }

  const totalAttendees = responses
    .filter(r => r.status === 'yes')
    .reduce((acc, r) => acc + 1 + (r.guests || 0), 0);

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

      {/* Event Details Card */}
      <section className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3 text-slate-300 text-sm">
          <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Samedi à 10:00 AM</span>
        </div>
        <div className="flex items-center gap-3 text-slate-300 text-sm">
          <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{schedule?.default_location || 'Centre Sportif Blocry (Salle G3)'}</span>
        </div>
      </section>

      {/* Target Progress Bar */}
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
            className={`h-2.5 rounded-full transition-all duration-500 ${isTargetMet ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min((totalAttendees / minRequired) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Attendance Voting Buttons */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase font-bold tracking-wider text-slate-400">
          Votre Présence ({player?.name || 'Joueur'})
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleResponse('yes', currentResponse?.guests || 0)}
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
            onClick={() => handleResponse('maybe', 0)}
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
            onClick={() => handleResponse('no', 0)}
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

        {/* Guests selector if confirmed present */}
        {currentResponse?.status === 'yes' && (
          <div className="pt-2 flex items-center justify-between bg-slate-800/30 p-3 rounded-xl border border-slate-700/30">
            <span className="text-xs text-slate-300 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-indigo-400" /> Invités supplémentaires
            </span>
            <div className="flex gap-1">
              {[0, 1, 2].map(num => (
                <button
                  key={num}
                  onClick={() => handleResponse('yes', num)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold ${
                    (currentResponse?.guests || 0) === num
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  +{num}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Roster List */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase font-bold tracking-wider text-slate-400">
          Liste des Participants
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
                  {resp.guests > 0 && (
                    <span className="ml-1.5 text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                      +{resp.guests} invité{resp.guests > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  resp.status === 'yes' ? 'bg-emerald-500/10 text-emerald-400' :
                  resp.status === 'maybe' ? 'bg-amber-500/10 text-amber-400' :
                  'bg-rose-500/10 text-rose-400'
                }`}>
                  {resp.status === 'yes' ? 'Présent' : resp.status === 'maybe' ? 'Incertain' : 'Absent'}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
