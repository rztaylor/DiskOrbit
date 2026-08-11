// Package api owns DiskOrbit's authenticated local HTTP application surface.
//
// It validates requests and maps application data to bounded JSON responses.
// Singleserve owns authentication around this handler; scanning, directory
// enumeration, browser lifecycle, and UI presentation belong to adjacent
// packages.
package api
