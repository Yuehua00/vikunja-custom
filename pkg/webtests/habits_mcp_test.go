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
	"net/http"
	"testing"

	"code.vikunja.io/api/pkg/user"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMCPPersonalHabits(t *testing.T) {
	e, err := setupTestEnv()
	require.NoError(t, err)
	owner := humaTokenFor(t, &testuser1)
	response := humaRequest(t, e, http.MethodPatch, "/api/v2/user/settings/general", `{"frontend_settings":{"habits":[{"id":"reading","name":"Private reading","days":[1,3,5],"weekly_target":3}],"habit_logs":{"2026-10-19":["reading"],"2026-10-20":[],"2026-10-26":["reading"]},"private_setting":"do not expose"}}`, owner, "application/merge-patch+json")
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	token := personalMCPToken(t, map[string][]string{http.MethodGet: {"/api/v2/habits/history"}})
	c := newMCPClientOn(t, e, token)
	assert.Contains(t, c.toolNames(), "habits_read")
	assert.NotContains(t, c.toolNames(), "diary_entries_list")
	var history struct {
		Habits []struct {
			Name string `json:"name"`
		} `json:"habits"`
		Logs                map[string][]string `json:"logs"`
		ConfigurationSource string              `json:"configuration_source"`
	}
	toolResultJSON(t, c.callTool("habits_read", map[string]any{"from": "2026-10-20", "to": "2026-10-26"}), &history)
	require.Len(t, history.Habits, 1)
	assert.Equal(t, "Private reading", history.Habits[0].Name)
	assert.Equal(t, "stored", history.ConfigurationSource)
	assert.NotContains(t, history.Logs, "2026-10-19")
	assert.Contains(t, history.Logs, "2026-10-20")
	assert.Equal(t, []string{"reading"}, history.Logs["2026-10-26"])
	response = humaRequest(t, e, http.MethodGet, "/api/v2/habits/history?from=2026-10-20&to=2026-10-26", "", token, "")
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.NotContains(t, response.Body.String(), "private_setting")
	assert.NotContains(t, response.Body.String(), "do not expose")
	response = humaRequest(t, e, http.MethodGet, "/api/v2/user/settings/general", "", token, "")
	assert.Equal(t, http.StatusUnauthorized, response.Code)
	other := humaTokenFor(t, &user.User{ID: 2, Username: "user2"})
	response = humaRequest(t, e, http.MethodGet, "/api/v2/habits/history?from=2026-10-20&to=2026-10-26", "", other, "")
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.NotContains(t, response.Body.String(), "Private reading")
	response = humaRequest(t, e, http.MethodGet, "/api/v2/habits/history?from=2026-10-20&to=2026-10-26", "", "", "")
	assert.Equal(t, http.StatusUnauthorized, response.Code)
	assert.Equal(t, true, c.callTool("habits_read", map[string]any{"from": "2024-01-01", "to": "2026-01-01"})["isError"])
	assert.Equal(t, true, c.callTool("habits_read", map[string]any{"from": "2026-02-30", "to": "2026-03-01"})["isError"])
}
