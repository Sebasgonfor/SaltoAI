import { redirect } from 'next/navigation';

/** Redirige al dashboard de necesidades — la lista de matches vive en /empresa/matches/[needId]. */
export default function MatchesIndex() {
  redirect('/empresa');
}
