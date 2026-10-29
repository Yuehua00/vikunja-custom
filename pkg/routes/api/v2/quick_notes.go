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
	"context"
	"fmt"
	"io"
	"net/http"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/files"
	"code.vikunja.io/api/pkg/models"
	"code.vikunja.io/api/pkg/web/handler"
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humaecho"
	"github.com/danielgtaylor/huma/v2/conditional"
)

type quickNoteListBody struct{ Body Paginated[*models.QuickNote] }
type quickNoteReadBody struct {
	models.QuickNote
	MaxPermission models.Permission `json:"max_permission" readOnly:"true" doc:"The owner has admin permission; other callers cannot read this note."`
}

func init() { AddRouteRegistrar(RegisterQuickNoteRoutes) }
func RegisterQuickNoteRoutes(api huma.API) {
	tags := []string{"quick_notes"}
	Register(api, huma.Operation{OperationID: "quick-notes-list", Summary: "List private note summaries", Description: "Only the caller's own notes. Search text and choose normal or trash; content is empty in summaries. Notes are never tasks or projects.", Method: http.MethodGet, Path: "/quick-notes", Tags: tags}, quickNotesList)
	Register(api, huma.Operation{OperationID: "quick-notes-read", Summary: "Read a private note", Description: "Owner only. Returns full HTML and a concurrency version.", Method: http.MethodGet, Path: "/quick-notes/{id}", Tags: tags}, quickNotesRead)
	Register(api, huma.Operation{OperationID: "quick-notes-create", Summary: "Create a private note", Description: "Sets ownership and derives title from content. Empty notes are allowed.", Method: http.MethodPost, Path: "/quick-notes", Tags: tags}, quickNotesCreate)
	Register(api, huma.Operation{OperationID: "quick-notes-update", Summary: "Save or restore a private note", Description: "Owner only. Replaces writable fields. Send the last read version; stale revisions return 409 without overwriting. Set is_trashed false to restore.", Method: http.MethodPut, Path: "/quick-notes/{id}", Tags: tags}, quickNotesUpdate)
	Register(api, huma.Operation{OperationID: "quick-notes-delete", Summary: "Move a private note to trash", Description: "Owner only. Soft deletion retains content and images. Restore through update; no permanent delete or expiry.", Method: http.MethodDelete, Path: "/quick-notes/{id}", Tags: tags}, quickNotesDelete)
	Register(api, withUploadLimits(huma.Operation{OperationID: "quick-note-images-upload", Summary: "Upload a private note image", Description: "Owner only. A single PNG, JPEG, GIF or WebP file, max 8 MB and subject to the configured file limit. Images stay private.", Method: http.MethodPost, Path: "/quick-notes/{id}/images", Tags: tags}), quickNoteImagesUpload)
	Register(api, huma.Operation{OperationID: "quick-note-images-download", Summary: "Download a private note image", Description: "Requires ownership of the note and an image attached to that exact note. No public image URL.", Method: http.MethodGet, Path: "/quick-notes/{id}/images/{file}", Tags: tags}, quickNoteImagesDownload)
}
func quickNotesList(ctx context.Context, in *struct {
	ListParams
	Trashed bool `query:"trashed" doc:"Return recoverable deleted notes instead of active notes."`
}) (*quickNoteListBody, error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	result, _, total, err := handler.DoReadAll(ctx, &models.QuickNote{IsTrashed: in.Trashed}, a, in.Q, in.Page, in.PerPage)
	if err != nil {
		return nil, translateDomainError(err)
	}
	notes, ok := result.([]*models.QuickNote)
	if !ok {
		return nil, fmt.Errorf("unexpected QuickNote list type %T", result)
	}
	return &quickNoteListBody{Body: NewPaginated(notes, total, in.Page, in.PerPage)}, nil
}
func quickNotesRead(ctx context.Context, in *struct {
	ID int64 `path:"id"`
	conditional.Params
}) (*singleReadBody[quickNoteReadBody], error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	note := &models.QuickNote{ID: in.ID}
	permission, err := handler.DoReadOne(ctx, note, a)
	if err != nil {
		return nil, translateDomainError(err)
	}
	return conditionalReadResponse(&in.Params, &quickNoteReadBody{QuickNote: *note, MaxPermission: models.Permission(permission)}, note.Updated, permission)
}
func quickNotesCreate(ctx context.Context, in *struct{ Body models.QuickNote }) (*singleBody[models.QuickNote], error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	if err = handler.DoCreate(ctx, &in.Body, a); err != nil {
		return nil, translateDomainError(err)
	}
	return &singleBody[models.QuickNote]{Body: &in.Body}, nil
}
func quickNotesUpdate(ctx context.Context, in *struct {
	ID   int64 `path:"id"`
	Body quickNoteReadBody
}) (*singleBody[models.QuickNote], error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	note := &in.Body.QuickNote
	note.ID = in.ID
	if err = handler.DoUpdate(ctx, note, a); err != nil {
		return nil, translateDomainError(err)
	}
	return &singleBody[models.QuickNote]{Body: note}, nil
}
func quickNotesDelete(ctx context.Context, in *struct {
	ID int64 `path:"id"`
}) (*emptyBody, error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	if err = handler.DoDelete(ctx, &models.QuickNote{ID: in.ID}, a); err != nil {
		return nil, translateDomainError(err)
	}
	return &emptyBody{}, nil
}

type quickNoteUploadInput struct {
	ID      int64 `path:"id"`
	RawBody huma.MultipartFormFiles[struct {
		File huma.FormFile `form:"file" required:"true"`
	}]
}

func quickNoteImagesUpload(ctx context.Context, in *quickNoteUploadInput) (*singleBody[models.QuickNoteImage], error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	s := db.NewSession()
	defer s.Close()
	f := in.RawBody.Data().File
	image, err := models.UploadQuickNoteImage(s, a, in.ID, f, f.Filename, uint64(f.Size))
	if err != nil {
		_ = s.Rollback()
		return nil, translateDomainError(err)
	}
	if err = s.Commit(); err != nil {
		_ = s.Rollback()
		if cleanup := files.DeleteBlob(image.FileID); cleanup != nil {
			return nil, fmt.Errorf("%w (image cleanup: %w)", err, cleanup)
		}
		return nil, translateDomainError(err)
	}
	return &singleBody[models.QuickNoteImage]{Body: image}, nil
}
func quickNoteImagesDownload(ctx context.Context, in *struct {
	ID   int64 `path:"id"`
	File int64 `path:"file"`
}) (*huma.StreamResponse, error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	s := db.NewReadSession()
	defer s.Close()
	f, err := models.GetQuickNoteImage(s, a, in.ID, in.File)
	if err != nil {
		return nil, translateDomainError(err)
	}
	return &huma.StreamResponse{Body: func(hctx huma.Context) {
		defer f.File.Close()
		c := humaecho.Unwrap(hctx)
		(*c).Response().Header().Set("Content-Type", f.Mime)
		(*c).Response().Header().Set("Cache-Control", "private, no-store")
		(*c).Response().Header().Set("X-Content-Type-Options", "nosniff")
		_, _ = io.Copy((*c).Response(), f.File)
	}}, nil
}
