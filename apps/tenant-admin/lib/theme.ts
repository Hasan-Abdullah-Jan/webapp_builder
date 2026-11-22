export const THEME_KEY = 'qs-theme';

/** Runs before first paint (inlined in app/layout.tsx) so there's no flash of the wrong theme. */
export const THEME_INIT_SCRIPT = `try{var m=localStorage.getItem('${THEME_KEY}')||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}`;
