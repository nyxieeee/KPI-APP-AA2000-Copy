/**
 * Global Navbar main row is `h-20` (5rem). Sign out lives in sidebars only (RoleSidenav, mobile drawer, admin aside).
 * Role rail: `76px` kapag menu lang; `272px` kapag bukas (may labels). Main content: `useRoleSidenavRail().railOpen`.
 */
export const APP_NAV_SIDENAV_TOP = 'top-20';
export const APP_NAV_SIDENAV_HEIGHT = 'h-[calc(100vh-5rem)]'; /* desktop: navbar is h-20 (5rem) */
export const APP_NAV_RAIL_PL_COLLAPSED = 'lg:pl-[76px]';
export const APP_NAV_RAIL_PL_EXPANDED = 'lg:pl-[272px]';
