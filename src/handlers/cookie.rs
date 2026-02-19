use hyper::{Body, Request, Response, StatusCode};
use super::common::{parse_query, OrInternalError};

pub async fn handle_delete_cookie(req: Request<Body>) -> Response<Body> {
    let name = req.uri().query()
        .and_then(|q| parse_query(q).remove("name"))
        .unwrap_or_default();

    if name.is_empty() {
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header("Content-Type", "application/json")
            .body(Body::from(r#"{"error":"missing name parameter"}"#))
            .or_500();
    }

    // Expire the cookie at the root path; also try the bare name with no path
    // so it covers cookies originally set at any common path.
    let expire = format!(
        "{}=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        name
    );

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .header("Set-Cookie", expire)
        .body(Body::from(r#"{"ok":true}"#))
        .or_500()
}
