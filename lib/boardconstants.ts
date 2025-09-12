// lib/boardConstants.ts
export const BOARD_TYPE_OPTIONS = [
    'Bulletin', 'Poster', 'Digital', 'Static', 'Wallscape', 'Transit', 'Mobile'
];

export const FACE_DIRECTION_OPTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export const FACE_READ_OPTIONS = ['LHR', 'RHR'] as const;

// If you use these anywhere:
export const COLOR_MODE_OPTIONS = ['RGB', 'CMYK'] as const;
