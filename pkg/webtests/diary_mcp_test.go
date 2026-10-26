// Vikunja is a to-do list application to facilitate your life.
// Copyright 2018-present Vikunja and contributors. All rights reserved.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package webtests

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/models"
	"code.vikunja.io/api/pkg/user"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMCPPersonalDiary(t *testing.T) {
	e, err := setupTestEnv()
	require.NoError(t, err)
	owner := humaTokenFor(t, &testuser1)
	created := humaRequest(t, e, http.MethodPost, "/api/v2/projects", `{"title":"日記"}`, owner, "")
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	var project struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &project))
	token := personalMCPToken(t, map[string][]string{http.MethodGet: {"/api/v2/diary/entries"}, http.MethodPost: {"/api/v2/diary/entries"}})
	c := newMCPClientOn(t, e, token)
	var first map[string]any
	toolResultJSON(t, c.callTool("diary_entries_save", map[string]any{"project": project.ID, "date": "2026-10-26", "text": "Original note", "confirmed": true}), &first)
	seed := db.NewSession()
	label := &models.Label{Title: "mood-good", CreatedByID: 1}
	_, err = seed.Insert(label)
	require.NoError(t, err)
	_, err = seed.Insert(&models.LabelTask{TaskID: int64(first["task_id"].(float64)), LabelID: label.ID})
	require.NoError(t, err)
	require.NoError(t, seed.Commit())
	require.NoError(t, seed.Close())
	var second map[string]any
	toolResultJSON(t, c.callTool("diary_entries_save", map[string]any{"project": project.ID, "date": "2026-10-26", "text": "Week review <b>plain</b>", "confirmed": true}), &second)
	assert.Equal(t, first["task_id"], second["task_id"])
	assert.Equal(t, "good", second["mood"])
	assert.Contains(t, second["description"], "Original note")
	assert.Contains(t, second["description"], "&lt;b&gt;plain&lt;/b&gt;")
	var entries map[string]any
	toolResultJSON(t, c.callTool("diary_entries_list", map[string]any{"project": project.ID, "from": "2026-10-26", "to": "2026-10-26"}), &entries)
	require.Len(t, entries["items"], 1)
	// Check the stored task remains finished so diary content stays out of open lists.
	s := db.NewReadSession()
	task := &models.Task{ID: int64(first["task_id"].(float64))}
	found, err := s.Get(task)
	require.NoError(t, err)
	require.True(t, found)
	assert.True(t, task.Done)
	require.NoError(t, s.Close())
	toolResultJSON(t, c.callTool("diary_entries_list", map[string]any{"project": project.ID, "from": "2026-10-01", "to": "2026-10-25"}), &entries)
	assert.Empty(t, entries["items"])
	for _, date := range []string{"2026-02-30", "invalid"} {
		assert.Equal(t, true, c.callTool("diary_entries_save", map[string]any{"project": project.ID, "date": date, "text": "bad", "confirmed": true})["isError"])
	}
	assert.Equal(t, true, c.callTool("diary_entries_save", map[string]any{"project": project.ID, "date": "2026-10-26", "text": "unapproved", "confirmed": false})["isError"])
	assert.Equal(t, true, c.callTool("diary_entries_list", map[string]any{"project": project.ID, "from": "2026-10-27", "to": "2026-10-26"})["isError"])
	// Sharing a diary project does not grant the dedicated private diary capability.
	s = db.NewSession()
	_, err = s.Insert(&models.ProjectUser{ProjectID: project.ID, UserID: 2, Permission: models.PermissionWrite})
	require.NoError(t, err)
	require.NoError(t, s.Commit())
	require.NoError(t, s.Close())
	other := humaTokenFor(t, &user.User{ID: 2, Username: "user2"})
	response := humaRequest(t, e, http.MethodGet, fmt.Sprintf("/api/v2/diary/entries?project=%d&from=2026-10-01&to=2026-10-26", project.ID), "", other, "")
	assert.Equal(t, http.StatusForbidden, response.Code, response.Body.String())
	response = humaRequest(t, e, http.MethodPost, "/api/v2/diary/entries", fmt.Sprintf(`{"project":%d,"date":"2026-10-26","text":"foreign","confirmed":true}`, project.ID), other, "")
	assert.Equal(t, http.StatusForbidden, response.Code, response.Body.String())
	response = humaRequest(t, e, http.MethodGet, fmt.Sprintf("/api/v2/diary/entries?project=%d&from=2026-10-26&to=2026-10-26&page=9223372036854775807", project.ID), "", owner, "")
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), `"items":[]`)
	// The research tool cannot be used as an alternative way into the diary.
	response = humaRequest(t, e, http.MethodGet, fmt.Sprintf("/api/v2/research/items?project=%d", project.ID), "", owner, "")
	assert.Equal(t, http.StatusForbidden, response.Code)
}
