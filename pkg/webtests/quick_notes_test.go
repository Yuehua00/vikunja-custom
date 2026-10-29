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
	"bytes"
	"code.vikunja.io/api/pkg/models"
	"code.vikunja.io/api/pkg/user"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/stretchr/testify/require"
	"mime/multipart"
	"net/http/httptest"
	"testing"
)

func TestQuickNotesAPI(t *testing.T) {
	e, err := setupTestEnv()
	require.NoError(t, err)
	token := humaTokenFor(t, &user.User{ID: 1})
	foreign := humaTokenFor(t, &user.User{ID: 2})
	created := humaRequest(t, e, "POST", "/api/v2/quick-notes", `{"content":"<p>隨手記測試</p>"}`, token, "")
	require.Equal(t, 201, created.Code, created.Body.String())
	var note models.QuickNote
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &note))
	require.Positive(t, note.ID)
	require.EqualValues(t, 1, note.Version)
	path := fmt.Sprintf("/api/v2/quick-notes/%d", note.ID)
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nTkAAAAASUVORK5CYII=")
	require.NoError(t, err)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "screenshot.png")
	require.NoError(t, err)
	_, err = part.Write(png)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	req := httptest.NewRequest("POST", path+"/images", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	uploaded := httptest.NewRecorder()
	e.ServeHTTP(uploaded, req)
	require.Equal(t, 201, uploaded.Code, uploaded.Body.String())
	var image models.QuickNoteImage
	require.NoError(t, json.Unmarshal(uploaded.Body.Bytes(), &image))
	require.Positive(t, image.FileID)
	imageURL := fmt.Sprintf("%s/images/%d", path, image.FileID)
	download := humaRequest(t, e, "GET", imageURL, "", token, "")
	require.Equal(t, 200, download.Code, download.Body.String())
	require.Equal(t, png, download.Body.Bytes())
	require.Equal(t, 404, humaRequest(t, e, "GET", imageURL, "", foreign, "").Code)
	require.Equal(t, 401, humaRequest(t, e, "GET", imageURL, "", "", "").Code)

	for _, method := range []string{"GET", "PUT", "DELETE"} {
		body := ""
		if method == "PUT" {
			body = `{"version":1,"content":"no"}`
		}
		res := humaRequest(t, e, method, path, body, foreign, "")
		require.Equal(t, 404, res.Code, res.Body.String())
	}
	require.Equal(t, 401, humaRequest(t, e, "GET", path, "", "", "").Code)
	update := humaRequest(t, e, "PUT", path, `{"version":1,"content":"<p>更新</p>","pinned":true}`, token, "")
	require.Equal(t, 200, update.Code, update.Body.String())
	require.Equal(t, 409, humaRequest(t, e, "PUT", path, `{"version":1,"content":"stale"}`, token, "").Code)
	read := humaRequest(t, e, "GET", path, "", token, "")
	require.Equal(t, 200, read.Code)
	require.Contains(t, read.Body.String(), "更新")
	del := humaRequest(t, e, "DELETE", path, "", token, "")
	require.Equal(t, 204, del.Code, del.Body.String())
	trash := humaRequest(t, e, "GET", "/api/v2/quick-notes?trashed=true", "", token, "")
	require.Equal(t, 200, trash.Code)
	require.Contains(t, trash.Body.String(), "更新")
	require.Equal(t, 200, humaRequest(t, e, "PUT", path, `{"version":3,"content":"<p>還原</p>"}`, token, "").Code)
}
