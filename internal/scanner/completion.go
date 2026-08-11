package scanner

import (
	"fmt"
	"sync"

	"github.com/rztaylor/diskorbit/internal/model"
)

const (
	completionRegistered uint8 = 1 << iota
	completionSelfFinished
	completionIncomplete
	completionFinalized
)

type completionState struct {
	parent  model.NodeID
	pending uint32
	bits    uint8
	_       [3]byte
}

// completionTracker keeps transient traversal state compact while final
// subtree-complete truth remains on the authoritative model nodes.
type completionTracker struct {
	mu     sync.Mutex
	tree   *model.Tree
	states []completionState
}

func newCompletionTracker(tree *model.Tree) *completionTracker {
	return &completionTracker{
		tree: tree,
		states: []completionState{{
			parent: model.NoNode,
			bits:   completionRegistered,
		}},
	}
}

func (t *completionTracker) add(parentID, childID model.NodeID) error {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.ensure(childID)
	if uint64(parentID) >= uint64(len(t.states)) || t.states[parentID].bits&completionRegistered == 0 {
		return fmt.Errorf("register directory completion: %w", model.ErrInvalidNode)
	}
	parent := &t.states[parentID]
	if parent.bits&completionFinalized != 0 || parent.pending == ^uint32(0) {
		return fmt.Errorf("register directory completion: invalid parent state")
	}
	child := &t.states[childID]
	if child.bits&completionRegistered != 0 {
		return fmt.Errorf("register directory completion: duplicate child state")
	}
	parent.pending++
	*child = completionState{parent: parentID, bits: completionRegistered}
	return nil
}

func (t *completionTracker) finish(nodeID model.NodeID, successful bool) error {
	t.mu.Lock()
	if uint64(nodeID) >= uint64(len(t.states)) {
		t.mu.Unlock()
		return fmt.Errorf("finish directory completion: %w", model.ErrInvalidNode)
	}
	state := &t.states[nodeID]
	if state.bits&completionRegistered == 0 || state.bits&completionSelfFinished != 0 {
		t.mu.Unlock()
		return fmt.Errorf("finish directory completion: invalid node state")
	}
	state.bits |= completionSelfFinished
	if !successful {
		state.bits |= completionIncomplete
	}

	completed := make([]model.NodeID, 0, 8)
	for current := nodeID; current != model.NoNode; {
		currentState := &t.states[current]
		if currentState.bits&completionFinalized != 0 || currentState.bits&completionSelfFinished == 0 || currentState.pending != 0 {
			break
		}
		currentState.bits |= completionFinalized
		if currentState.bits&completionIncomplete == 0 {
			completed = append(completed, current)
		}
		parentID := currentState.parent
		if parentID == model.NoNode {
			break
		}
		parent := &t.states[parentID]
		if parent.pending == 0 {
			t.mu.Unlock()
			return fmt.Errorf("finish directory completion: invalid pending count")
		}
		parent.pending--
		if currentState.bits&completionIncomplete != 0 {
			parent.bits |= completionIncomplete
		}
		current = parentID
	}
	t.mu.Unlock()

	for _, completedID := range completed {
		if err := t.tree.Mark(completedID, model.FlagSubtreeComplete); err != nil {
			return fmt.Errorf("mark completed directory: %w", err)
		}
	}
	return nil
}

func (t *completionTracker) ensure(nodeID model.NodeID) {
	if missing := int(nodeID) + 1 - len(t.states); missing > 0 {
		t.states = append(t.states, make([]completionState, missing)...)
	}
}
