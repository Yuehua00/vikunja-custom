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
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"code.vikunja.io/api/pkg/utils"

	"github.com/danielgtaylor/huma/v2"
	"golang.org/x/net/html"
)

const (
	urlTitleTimeout   = 5 * time.Second
	urlTitleMaxBytes  = 256 * 1024
	urlTitleMaxLength = 250
)

type urlTitleInput struct {
	URL string `query:"url" required:"true" maxLength:"2048" doc:"The http or https address to look up."`
}

type urlTitleBody struct {
	Body struct {
		Title string `json:"title" doc:"The page title, or the host name when the page has none or cannot be fetched."`
	}
}

// RegisterURLTitleRoutes wires the page-title lookup onto the Huma API.
func RegisterURLTitleRoutes(api huma.API) {
	Register(api, huma.Operation{
		OperationID: "url-title",
		Summary:     "Look up the title of a web page",
		Description: "Fetches the given http(s) address on the server and returns its <title>. The request is made through the SSRF-guarded client, so private and local addresses are refused. Whenever the page cannot be fetched or has no title, the host name is returned instead, so a valid address never fails.",
		Method:      http.MethodGet,
		Path:        "/url-title",
		Tags:        []string{"service"},
	}, urlTitleRead)
}

func init() { AddRouteRegistrar(RegisterURLTitleRoutes) }

func urlTitleRead(ctx context.Context, in *urlTitleInput) (*urlTitleBody, error) {
	if _, err := authFromCtx(ctx); err != nil {
		return nil, err
	}

	target, err := url.Parse(strings.TrimSpace(in.URL))
	if err != nil || (target.Scheme != "http" && target.Scheme != "https") || target.Hostname() == "" {
		return nil, huma.Error400BadRequest("url must be a valid http or https address")
	}

	out := &urlTitleBody{}
	out.Body.Title = fetchPageTitle(ctx, target)
	if out.Body.Title == "" {
		out.Body.Title = hostFallbackTitle(target)
	}
	return out, nil
}

// fetchPageTitle returns an empty string on any failure; the caller falls back to the host name.
func fetchPageTitle(ctx context.Context, target *url.URL) string {
	ctx, cancel := context.WithTimeout(ctx, urlTitleTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := utils.NewSSRFSafeHTTPClient().Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return ""
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "html") {
		return ""
	}

	return extractHTMLTitle(io.LimitReader(resp.Body, urlTitleMaxBytes))
}

// extractHTMLTitle returns the whitespace-collapsed text of the first <title> element.
func extractHTMLTitle(r io.Reader) string {
	z := html.NewTokenizer(r)
	for {
		switch z.Next() {
		case html.ErrorToken:
			return ""
		case html.TextToken, html.EndTagToken, html.SelfClosingTagToken, html.CommentToken, html.DoctypeToken:
			continue
		case html.StartTagToken:
			name, _ := z.TagName()
			if string(name) != "title" {
				continue
			}
			if z.Next() != html.TextToken {
				return ""
			}
			title := strings.Join(strings.Fields(string(z.Text())), " ")
			if runes := []rune(title); len(runes) > urlTitleMaxLength {
				title = string(runes[:urlTitleMaxLength])
			}
			return title
		}
	}
}

func hostFallbackTitle(target *url.URL) string {
	return strings.TrimPrefix(target.Hostname(), "www.")
}
