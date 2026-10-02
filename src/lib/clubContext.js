export function getClubSlug() {
  const urlParams = new URLSearchParams(window.location.search);
  const clubParam = urlParams.get('club');
  
  if (clubParam) {
    return clubParam.toLowerCase();
  }
  
  // Fallback implicit pentru URL-ul Workers fără parametru
  return 'lamanchette';
}
