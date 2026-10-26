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
	"time"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A token is granted only the requested resource routes plus MCP transport.
func personalMCPToken(t *testing.T, methods map[string][]string) string {
	t.Helper()
	permissions := models.APIPermissions{"mcp": {"access"}}
	for method, paths := range methods {
		for _, path := range paths {
			found := false
			for group, routes := range models.GetAPITokenRoutes() {
				for permission, route := range routes {
					if route.Method == method && route.Path == path {
						permissions[group] = append(permissions[group], permission)
						found = true
					}
				}
			}
			require.True(t, found, "permission for %s %s", method, path)
		}
	}
	token := &models.APIToken{Title: "personal MCP test", ExpiresAt: time.Now().Add(time.Hour), APIPermissions: permissions}
	s := db.NewSession()
	defer s.Close()
	require.NoError(t, token.Create(s, &testuser1))
	require.NoError(t, s.Commit())
	return token.Token
}

func TestMCPPersonalResearch(t *testing.T) {
	e, err := setupTestEnv()
	require.NoError(t, err)
	token := personalMCPToken(t, map[string][]string{http.MethodGet: {"/api/v2/research/items"}, http.MethodPost: {"/api/v2/research/items"}})
	c := newMCPClientOn(t, e, token)
	assert.Contains(t, c.toolNames(), "research_items_list")
	assert.Contains(t, c.toolNames(), "research_items_create")
	assert.NotContains(t, c.toolNames(), "diary_entries_list")
	var created map[string]any
	toolResultJSON(t, c.callTool("research_items_create", map[string]any{"project": 1, "title": "LLM Paper", "source_url": "https://example.org/paper", "notes": "<script>source</script>", "summary": "Model summary", "next_steps": []string{"Try an ablation"}, "confirmed": true}), &created)
	description := created["description"].(string)
	assert.Contains(t, description, "https://example.org/paper")
	assert.Contains(t, description, "&lt;script&gt;")
	assert.NotContains(t, description, "<script>")
	assert.Contains(t, description, "AI 摘要")
	assert.Contains(t, description, "Try an ablation")
	var items map[string]any
	toolResultJSON(t, c.callTool("research_items_list", map[string]any{"project": 1, "q": "LLM Paper"}), &items)
	require.Len(t, items["items"], 1)
	assert.Equal(t, true, c.callTool("research_items_create", map[string]any{"project": 1, "title": "Unapproved", "confirmed": false})["isError"])
	assert.Equal(t, true, c.callTool("research_items_create", map[string]any{"project": 1, "title": "Bad URL", "source_url": "javascript:alert(1)", "confirmed": true})["isError"])
	assert.Equal(t, true, c.callTool("research_items_list", map[string]any{"project": 20})["isError"])
	assert.Equal(t, true, c.callTool("research_items_create", map[string]any{"project": 20, "title": "Forbidden", "confirmed": true})["isError"])
}

func TestMCPPersonalResearchReadOnly(t *testing.T) {
	e, err := setupTestEnv()
	require.NoError(t, err)
	token := personalMCPToken(t, map[string][]string{http.MethodGet: {"/api/v2/research/items"}})
	c := newMCPClientOn(t, e, token)
	assert.Contains(t, c.toolNames(), "research_items_list")
	assert.NotContains(t, c.toolNames(), "research_items_create")
	response := humaRequest(t, e, http.MethodPost, "/api/v2/research/items", `{"project":1,"title":"Denied","confirmed":true}`, token, "")
	assert.Equal(t, http.StatusUnauthorized, response.Code)
}
