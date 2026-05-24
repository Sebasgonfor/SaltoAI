'use client';

import { JovenNav } from '@/components/joven-nav';
import { UserButton } from '@/components/auth/user-button';
import { ResponsiveRoleHeader } from '@/components/layout/responsive-role-header';

export function JovenHeader() {
  return (
    <ResponsiveRoleHeader
      logoHref="/dashboard"
      desktopNav={<JovenNav layout="row" />}
      drawerNav={(close) => <JovenNav layout="column" onNavigate={close} />}
      mobileTrailing={<UserButton />}
      desktopTrailing={<UserButton />}
    />
  );
}
