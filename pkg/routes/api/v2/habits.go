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
	"encoding/json"
	"net/http"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/user"
	"github.com/danielgtaylor/huma/v2"
)

type habitDefinition struct {
	ID           string `json:"id" doc:"Stable frontend habit id."`
	Name         string `json:"name" doc:"Habit display name."`
	Days         []int  `json:"days" doc:"Current planned weekdays: 0 Sunday through 6 Saturday. Historical schedule changes are not stored."`
	WeeklyTarget int    `json:"weekly_target" doc:"Current weekly goal; not a per-day quota."`
	ProjectID    *int64 `json:"project_id,omitempty" doc:"Optional project practiced by this habit."`
}

type habitHistory struct {
	Habits              []habitDefinition   `json:"habits" doc:"Current habit configuration, not a historical schedule."`
	Logs                map[string][]string `json:"logs" doc:"Recorded local dates to completed habit ids, restricted to the requested range. A missing date means no stored check-in, not proof of a missed habit."`
	From                string              `json:"from" doc:"Inclusive first calendar date."`
	To                  string              `json:"to" doc:"Inclusive last calendar date."`
	Timezone            string              `json:"timezone" doc:"User timezone; UTC if unset."`
	ConfigurationSource string              `json:"configuration_source" doc:"stored or defaults. Default habits have no inferred completion history."`
}

func init() { AddRouteRegistrar(RegisterHabitRoutes) }

// RegisterHabitRoutes exposes a read-only projection, never the rest of account settings.
func RegisterHabitRoutes(api huma.API) {
	Register(api, huma.Operation{OperationID: "habits-read", Method: http.MethodGet, Path: "/habits/history", Tags: []string{"habits"}, Summary: "Read habit configuration and check-ins for a date range", Description: "Returns only the authenticated user's current habits and recorded check-ins for an explicit range of at most 366 days. Does not expose or modify other account settings. Current schedules are not historical schedules; missing logs are not proof of non-completion. Analysis is performed by the client model, not this endpoint."}, habitsRead)
}

func habitsRead(ctx context.Context, in *DateRangeParams) (*singleBody[habitHistory], error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	if err := in.validate(); err != nil {
		return nil, err
	}
	doer, err := user.GetFromAuth(a)
	if err != nil {
		return nil, translateDomainError(err)
	}
	s := db.NewReadSession()
	defer s.Close()
	u, err := user.GetUserByID(s, doer.ID)
	if err != nil {
		return nil, translateDomainError(err)
	}
	var settings struct {
		Habits *[]habitDefinition  `json:"habits"`
		Logs   map[string][]string `json:"habit_logs"`
	}
	data, err := json.Marshal(u.FrontendSettings)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, err
	}
	habits := []habitDefinition{{ID: "speaking", Name: "英文口說", Days: []int{1, 2, 3, 4, 5}, WeeklyTarget: 5}, {ID: "leetcode", Name: "LeetCode", Days: []int{1, 3, 5}, WeeklyTarget: 3}, {ID: "ctf", Name: "資安 CTF", Days: []int{2, 6}, WeeklyTarget: 2}, {ID: "hardware-ai", Name: "硬體或 AI 用法", Days: []int{4, 0}, WeeklyTarget: 2}} //nolint:gosmopolitan // Preserve the localized names and headings used by the custom UI.
	source := "defaults"
	if settings.Habits != nil {
		habits = *settings.Habits
		source = "stored"
	}
	logs := map[string][]string{}
	for date, ids := range settings.Logs {
		if (DateRangeParams{From: date, To: date}).validate() != nil {
			continue
		}
		if date >= in.From && date <= in.To {
			logs[date] = ids
		}
	}
	timezone := u.Timezone
	if timezone == "" {
		timezone = "UTC"
	}
	return &singleBody[habitHistory]{Body: &habitHistory{Habits: habits, Logs: logs, From: in.From, To: in.To, Timezone: timezone, ConfigurationSource: source}}, nil
}
