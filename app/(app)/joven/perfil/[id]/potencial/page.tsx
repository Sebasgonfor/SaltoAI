'use client';

import LatentProfileSection from '@/components/joven/latent-profile';
import SkillsGap from '@/components/skills-gap';
import { YouthFeedbackInbox } from '@/components/feedback/youth-inbox';
import { useProfile } from '../profile-context';

/**
 * Módulo "Potencial": la mirada al futuro. Talento latente (habilidades
 * ocultas y roles sugeridos), plan de crecimiento y los mensajes/feedback que
 * las empresas dejaron. Crecimiento y mensajes son privados del dueño.
 */
export default function PotencialPage() {
  const { id, viewerIsEmpresa } = useProfile();

  return (
    <>
      <LatentProfileSection profileId={id} />

      {!viewerIsEmpresa && <SkillsGap profileId={id} />}

      {!viewerIsEmpresa && <YouthFeedbackInbox profileId={id} />}
    </>
  );
}
