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

package apiv2

import (
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExtractHTMLTitle(t *testing.T) {
	t.Run("plain title", func(t *testing.T) {
		assert.Equal(t, "Hello", extractHTMLTitle(strings.NewReader("<html><head><title>Hello</title></head></html>")))
	})
	t.Run("collapses whitespace and decodes entities", func(t *testing.T) {
		in := "<head><title>\n  Tom &amp;   Jerry \n</title></head>"
		assert.Equal(t, "Tom & Jerry", extractHTMLTitle(strings.NewReader(in)))
	})
	t.Run("no title", func(t *testing.T) {
		assert.Empty(t, extractHTMLTitle(strings.NewReader("<html><body>nothing here</body></html>")))
	})
	t.Run("empty title", func(t *testing.T) {
		assert.Empty(t, extractHTMLTitle(strings.NewReader("<title></title>")))
	})
	t.Run("long title is cut", func(t *testing.T) {
		in := "<title>" + strings.Repeat("a", urlTitleMaxLength+50) + "</title>"
		assert.Len(t, []rune(extractHTMLTitle(strings.NewReader(in))), urlTitleMaxLength)
	})
}

func TestHostFallbackTitle(t *testing.T) {
	for in, want := range map[string]string{
		"https://github.com/karpathy/nanoGPT": "github.com",
		"http://www.example.com:8080/a?b=c":   "example.com",
	} {
		u, err := url.Parse(in)
		require.NoError(t, err)
		assert.Equal(t, want, hostFallbackTitle(u), in)
	}
}
