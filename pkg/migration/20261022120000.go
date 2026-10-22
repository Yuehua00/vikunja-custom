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
	"fmt"

	"src.techknowlogick.com/xormigrate"
	"xorm.io/xorm"
)

type taskPaused20261022120000 struct {
	Paused bool `xorm:"bool null"`
}

func (taskPaused20261022120000) TableName() string {
	return "tasks"
}

func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID:          "20261022120000",
		Description: "Add paused to tasks, for a task that was started and is put aside with its progress kept",
		Migrate: func(tx *xorm.Engine) error {
			if err := partialSync(tx, taskPaused20261022120000{}); err != nil {
				return fmt.Errorf("could not add tasks.paused: %w", err)
			}
			return nil
		},
		Rollback: func(_ *xorm.Engine) error {
			return nil
		},
	})
}
