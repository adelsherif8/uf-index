// Featherweight screen navigator — the app is a guided flow, not a deep-link maze.
import { createContext, useContext } from 'react';

export type Screen =
  | 'splash' | 'welcome' | 'auth' | 'consent'
  | 'profile' | 'measure' | 'energy' | 'feel' | 'sleep'
  | 'machine' | 'ticket' | 'breakdown' | 'delta'
  | 'dashboard' | 'insights' | 'history' | 'badges' | 'coach'
  | 'plus' | 'who5' | 'pss' | 'psqiTimes' | 'psqiTroubles' | 'plusResult' | 'settings' | 'console' | 'privacy';

export interface NavApi { screen: Screen; go: (s: Screen) => void }

export const NavCtx = createContext<NavApi>({ screen: 'splash', go: () => {} });
export const useNav = () => useContext(NavCtx);
