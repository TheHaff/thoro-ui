// The React tests wrap updates in act(); this flag tells React so, and keeps it from warning.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
