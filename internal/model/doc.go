// Package model owns DiskOrbit's compact authoritative filesystem tree.
//
// It stores nodes in indexed arrays, names in one byte arena, and parent/child
// relationships as integer links. It owns deterministic size, count, and broad
// file-type aggregate updates, compact node-condition flags, and bounded node
// views; filesystem discovery, scan scheduling, HTTP, and browser presentation
// belong to adjacent packages.
package model
