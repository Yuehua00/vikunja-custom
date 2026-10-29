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

package migration

import (
	"src.techknowlogick.com/xormigrate"
	"time"
	"xorm.io/xorm"
)

type quickNotes20261028130942 struct {
	ID        int64     `xorm:"bigint autoincr not null unique pk"`
	OwnerID   int64     `xorm:"bigint not null index"`
	Title     string    `xorm:"varchar(250) not null"`
	Preview   string    `xorm:"text null"`
	Content   string    `xorm:"longtext null"`
	Pinned    bool      `xorm:"not null default false"`
	IsTrashed bool      `xorm:"not null default false index"`
	Version   int64     `xorm:"bigint not null default 1"`
	Created   time.Time `xorm:"created not null"`
	Updated   time.Time `xorm:"updated not null index"`
}

func (quickNotes20261028130942) TableName() string { return "quick_notes" }

type quickNoteImages20261028130942 struct {
	NoteID int64 `xorm:"bigint not null pk"`
	FileID int64 `xorm:"bigint not null unique pk"`
}

func (quickNoteImages20261028130942) TableName() string { return "quick_note_images" }
func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID: "20261028130942", Description: "Independent private quick notes and image ownership",
		Migrate: func(tx *xorm.Engine) error {
			return tx.Sync(quickNotes20261028130942{}, quickNoteImages20261028130942{})
		},
		Rollback: func(tx *xorm.Engine) error {
			return tx.DropTables(quickNoteImages20261028130942{}, quickNotes20261028130942{})
		},
	})
}
