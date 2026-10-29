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
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"

	"code.vikunja.io/api/pkg/files"
	"code.vikunja.io/api/pkg/user"
	"code.vikunja.io/api/pkg/web"
	"github.com/gabriel-vasile/mimetype"
	"github.com/microcosm-cc/bluemonday"
	"golang.org/x/net/html"
	"xorm.io/xorm"
)

// QuickNote is private to a single authenticated user, independent of projects and tasks.
type QuickNote struct {
	ID              int64      `xorm:"bigint autoincr not null unique pk" json:"id" readOnly:"true" doc:"Private note identifier."`
	OwnerID         int64      `xorm:"bigint not null index" json:"-"`
	Title           string     `xorm:"varchar(250) not null" json:"title" readOnly:"true" doc:"First non-empty text line, derived by the server."`
	Preview         string     `xorm:"text null" json:"preview" readOnly:"true" doc:"Short plain-text preview; never HTML."`
	Content         string     `xorm:"longtext null" json:"content" maxLength:"1000000" doc:"Rich text HTML. Omitted content is empty in list summaries; fetch a single note before editing."`
	Pinned          bool       `xorm:"not null default false" json:"pinned" doc:"Keep this note at the top of the list."`
	IsTrashed       bool       `xorm:"not null default false index" json:"is_trashed" doc:"Soft deletion only. Set false to restore; no automatic permanent deletion."`
	Version         int64      `xorm:"bigint not null default 1" json:"version" doc:"Optimistic concurrency revision. Send the last read version on update; stale writes return 409."`
	Created         time.Time  `xorm:"created not null" json:"created" readOnly:"true" doc:"Creation time, set by the server."`
	Updated         time.Time  `xorm:"updated not null index" json:"updated" readOnly:"true" doc:"Last edit time, set by the server."`
	original        *QuickNote `xorm:"-" json:"-"`
	web.CRUDable    `xorm:"-" json:"-"`
	web.Permissions `xorm:"-" json:"-"`
}

func (*QuickNote) TableName() string { return "quick_notes" }

type QuickNoteImage struct {
	NoteID int64 `xorm:"bigint not null pk" json:"note_id" readOnly:"true" doc:"Owning private note."`
	FileID int64 `xorm:"bigint not null unique pk" json:"file_id" readOnly:"true" doc:"Image file identifier; access always requires note ownership."`
}

func (*QuickNoteImage) TableName() string { return "quick_note_images" }

type QuickNoteError struct {
	Status  int
	Message string
}

func (e QuickNoteError) Error() string { return e.Message }
func (e QuickNoteError) HTTPError() web.HTTPError {
	return web.HTTPError{HTTPCode: e.Status, Code: 12001, Message: e.Message}
}

func (n *QuickNote) CanCreate(_ *xorm.Session, a web.Auth) (bool, error) {
	_, ok := a.(*user.User)
	return ok && a.GetID() > 0, nil
}
func (n *QuickNote) owned(s *xorm.Session, a web.Auth) (bool, error) {
	if ok, _ := n.CanCreate(s, a); !ok {
		return false, nil
	}
	current := &QuickNote{}
	exists, err := s.ID(n.ID).Get(current)
	if err != nil {
		return false, err
	}
	if !exists || current.OwnerID != a.GetID() {
		return false, QuickNoteError{404, "Note not found"}
	}
	n.original = current
	return true, nil
}
func (n *QuickNote) CanRead(s *xorm.Session, a web.Auth) (bool, int, error) {
	ok, err := n.owned(s, a)
	return ok, int(PermissionAdmin), err
}
func (n *QuickNote) CanUpdate(s *xorm.Session, a web.Auth) (bool, error) { return n.owned(s, a) }
func (n *QuickNote) CanDelete(s *xorm.Session, a web.Auth) (bool, error) { return n.owned(s, a) }

var quickNotePolicy = func() *bluemonday.Policy {
	p := bluemonday.UGCPolicy()
	p.AllowAttrs("data-note-image-id").Matching(regexp.MustCompile(`^[1-9][0-9]*$`)).OnElements("img")
	return p
}()

func (n *QuickNote) clean() error {
	if len(n.Content) > 1000000 {
		return QuickNoteError{413, "Note is too large"}
	}
	n.Content = quickNotePolicy.Sanitize(n.Content)
	root, err := html.Parse(strings.NewReader(n.Content))
	if err != nil {
		return err
	}
	var text strings.Builder
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.TextNode {
			text.WriteString(node.Data)
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
		if node.Type == html.ElementNode && (node.Data == "p" || node.Data == "li" || node.Data == "div" || node.Data == "br") {
			text.WriteByte('\n')
		}
	}
	walk(root)
	plain := strings.TrimSpace(text.String())
	n.Title = ""
	for _, line := range strings.Split(plain, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			n.Title = line
			break
		}
	}
	title := []rune(n.Title)
	if len(title) > 250 {
		n.Title = string(title[:250])
	}
	if n.Title == "" {
		if strings.Contains(n.Content, "<img") {
			n.Title = "圖片筆記"
		} else {
			n.Title = "未命名筆記"
		}
	}
	preview := []rune(strings.Join(strings.Fields(plain), " "))
	if len(preview) > 160 {
		preview = preview[:160]
	}
	n.Preview = string(preview)
	return nil
}
func (n *QuickNote) Create(s *xorm.Session, a web.Auth) error {
	if err := n.clean(); err != nil {
		return err
	}
	n.ID = 0
	n.OwnerID = a.GetID()
	n.Version = 1
	n.IsTrashed = false
	n.Created = time.Time{}
	n.Updated = time.Time{}
	_, err := s.Insert(n)
	return err
}
func (n *QuickNote) ReadOne(_ *xorm.Session, _ web.Auth) error {
	if n.original == nil {
		return QuickNoteError{404, "Note not found"}
	}
	*n = *n.original
	return nil
}
func (n *QuickNote) ReadAll(s *xorm.Session, a web.Auth, search string, page, perPage int) (any, int, int64, error) {
	if ok, _ := n.CanCreate(s, a); !ok {
		return nil, 0, 0, QuickNoteError{403, "Private notes require a user session"}
	}
	query := func() *xorm.Session {
		q := s.Where("owner_id = ? AND is_trashed = ?", a.GetID(), n.IsTrashed)
		if search != "" {
			q = q.And("(title LIKE ? OR preview LIKE ? OR content LIKE ?)", "%"+search+"%", "%"+search+"%", "%"+search+"%")
		}
		return q
	}
	total, err := query().Count(&QuickNote{})
	if err != nil {
		return nil, 0, 0, err
	}
	limit, start := getLimitFromPageIndex(page, perPage)
	notes := []*QuickNote{}
	err = query().Omit("content").OrderBy("pinned DESC, updated DESC, id DESC").Limit(limit, start).Find(&notes)
	return notes, len(notes), total, err
}
func (n *QuickNote) Update(s *xorm.Session, _ web.Auth) error {
	if n.original == nil {
		return QuickNoteError{404, "Note not found"}
	}
	if n.Version != n.original.Version {
		return QuickNoteError{409, "Note changed on another device. Reload before saving."}
	}
	if err := n.clean(); err != nil {
		return err
	}
	previous := n.Version
	n.Version++
	count, err := s.Where("id = ? AND owner_id = ? AND version = ?", n.ID, n.original.OwnerID, previous).Cols("title", "preview", "content", "pinned", "is_trashed", "version").Update(n)
	if err != nil {
		return err
	}
	if count == 0 {
		return QuickNoteError{409, "Note changed on another device. Reload before saving."}
	}
	n.OwnerID = n.original.OwnerID
	n.Created = n.original.Created
	return nil
}

// Delete only moves a note to the recoverable trash; images remain attached.
func (n *QuickNote) Delete(s *xorm.Session, _ web.Auth) error {
	if n.original == nil {
		return QuickNoteError{404, "Note not found"}
	}
	n.Content = n.original.Content
	n.Pinned = n.original.Pinned
	n.Version = n.original.Version
	n.IsTrashed = true
	return n.Update(s, nil)
}

// UploadQuickNoteImage checks note ownership before storing bytes in the shared private file store.
func UploadQuickNoteImage(s *xorm.Session, a web.Auth, noteID int64, r io.ReadSeeker, name string, size uint64) (*QuickNoteImage, error) {
	note := &QuickNote{ID: noteID}
	ok, err := note.CanUpdate(s, a)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, QuickNoteError{403, "Forbidden"}
	}
	if note.original.IsTrashed {
		return nil, QuickNoteError{409, "Restore the note before uploading"}
	}
	end, err := r.Seek(0, io.SeekEnd)
	if err != nil {
		return nil, err
	}
	if end > 8*1024*1024 {
		return nil, QuickNoteError{413, "Images must be 8 MB or smaller"}
	}
	if _, err = r.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	mime, err := mimetype.DetectReader(r)
	if err != nil {
		return nil, err
	}
	switch mime.String() {
	case "image/png", "image/jpeg", "image/gif", "image/webp":
	default:
		return nil, QuickNoteError{400, "Use PNG, JPEG, GIF or WebP images"}
	}
	if _, err = r.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	file, err := files.CreateWithSession(s, r, name, size, a)
	if err != nil {
		return nil, err
	}
	image := &QuickNoteImage{NoteID: noteID, FileID: file.ID}
	if _, err = s.Insert(image); err != nil {
		if cleanup := files.DeleteBlob(file.ID); cleanup != nil {
			return nil, fmt.Errorf("%w (image cleanup: %v)", err, cleanup)
		}
		return nil, err
	}
	return image, nil
}
func GetQuickNoteImage(s *xorm.Session, a web.Auth, noteID, fileID int64) (*files.File, error) {
	note := &QuickNote{ID: noteID}
	ok, _, err := note.CanRead(s, a)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, QuickNoteError{403, "Forbidden"}
	}
	exists, err := s.Where("note_id = ? AND file_id = ?", noteID, fileID).Exist(&QuickNoteImage{})
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, QuickNoteError{404, "Image not found"}
	}
	f := &files.File{ID: fileID}
	if err = f.LoadFileMetaByID(s); err != nil {
		return nil, err
	}
	if err = f.LoadFileByID(); err != nil {
		return nil, err
	}
	return f, nil
}
