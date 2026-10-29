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

package models

import (
	"bytes"
	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/user"
	"encoding/base64"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestQuickNoteOwnershipAndRevision(t *testing.T) {
	db.LoadAndAssertFixtures(t)
	s := db.NewSession()
	defer s.Close()
	owner := &user.User{ID: 1}
	stranger := &user.User{ID: 2}
	note := &QuickNote{Content: "<p>第一則筆記</p><script>alert(1)</script>"}
	ok, err := note.CanCreate(s, owner)
	require.NoError(t, err)
	require.True(t, ok)
	ok, err = note.CanCreate(s, &LinkSharing{ID: 1})
	require.NoError(t, err)
	require.False(t, ok)
	require.NoError(t, note.Create(s, owner))
	require.Equal(t, "第一則筆記", note.Title)
	require.NotContains(t, note.Content, "script")
	for _, caller := range []*user.User{owner, stranger} {
		current := &QuickNote{ID: note.ID}
		read, _, readErr := current.CanRead(s, caller)
		require.Equal(t, caller.ID == owner.ID, read)
		update, updateErr := current.CanUpdate(s, caller)
		remove, removeErr := current.CanDelete(s, caller)
		require.Equal(t, caller.ID == owner.ID, update)
		require.Equal(t, caller.ID == owner.ID, remove)
		if caller.ID == owner.ID {
			require.NoError(t, readErr)
			require.NoError(t, updateErr)
			require.NoError(t, removeErr)
		} else {
			require.Error(t, readErr)
			require.Error(t, updateErr)
			require.Error(t, removeErr)
		}
	}
	edit := &QuickNote{ID: note.ID, Version: 1, Content: "<p>已更新</p>", Pinned: true}
	ok, err = edit.CanUpdate(s, owner)
	require.NoError(t, err)
	require.True(t, ok)
	require.NoError(t, edit.Update(s, owner))
	require.EqualValues(t, 2, edit.Version)
	stale := &QuickNote{ID: note.ID, Version: 1, Content: "<p>不能蓋掉</p>"}
	_, err = stale.CanUpdate(s, owner)
	require.NoError(t, err)
	require.Error(t, stale.Update(s, owner))
	deleted := &QuickNote{ID: note.ID}
	_, err = deleted.CanDelete(s, owner)
	require.NoError(t, err)
	require.NoError(t, deleted.Delete(s, owner))
	require.True(t, deleted.IsTrashed)
	require.Contains(t, deleted.Content, "已更新")
	restore := &QuickNote{ID: note.ID, Version: deleted.Version, Content: deleted.Content}
	_, err = restore.CanUpdate(s, owner)
	require.NoError(t, err)
	require.NoError(t, restore.Update(s, owner))
	require.False(t, restore.IsTrashed)
	// File ownership is not sufficient: an image must also belong to the exact note.
	other := &QuickNote{Content: "other"}
	require.NoError(t, other.Create(s, owner))
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nTkAAAAASUVORK5CYII=")
	require.NoError(t, err)
	image, err := UploadQuickNoteImage(s, owner, note.ID, bytes.NewReader(png), "test.png", uint64(len(png)))
	require.NoError(t, err)
	_, err = GetQuickNoteImage(s, stranger, note.ID, image.FileID)
	require.Error(t, err)
	_, err = GetQuickNoteImage(s, owner, other.ID, image.FileID)
	require.Error(t, err)
	f, err := GetQuickNoteImage(s, owner, note.ID, image.FileID)
	require.NoError(t, err)
	require.NoError(t, f.File.Close())
	_, err = UploadQuickNoteImage(s, owner, note.ID, bytes.NewReader([]byte("<svg></svg>")), "bad.png", 11)
	require.Error(t, err)
	_, err = UploadQuickNoteImage(s, &LinkSharing{ID: 1}, note.ID, bytes.NewReader(png), "test.png", uint64(len(png)))
	require.Error(t, err)
	require.NoError(t, s.Commit())
}

func TestQuickNoteImageHTML(t *testing.T) {
	note := &QuickNote{Content: `<p>文字</p><img src="#" data-note-image-id="42" onerror="alert(1)"><script>bad()</script>`}
	require.NoError(t, note.clean())
	require.Contains(t, note.Content, `data-note-image-id="42"`)
	require.Contains(t, note.Content, "<img")
	require.NotContains(t, note.Content, "onerror")
	require.NotContains(t, note.Content, "script")
}
