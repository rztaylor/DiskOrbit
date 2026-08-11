// Package settings owns validated, non-sensitive user display preferences.
//
// It provides defaults and atomic JSON persistence in the operating system's
// user configuration directory. HTTP transport belongs to api; browser state,
// scan paths, filesystem observations, and credentials must not be stored here.
package settings
