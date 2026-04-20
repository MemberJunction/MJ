"""
sqlglot-ts Python microservice.
Thin FastAPI wrapper around Python's sqlglot library (https://github.com/tobymao/sqlglot).
Runs on 127.0.0.1 with an ephemeral port for security.
"""
from fastapi import FastAPI
from pydantic import BaseModel
import sqlglot
import sqlglot.errors
import uvicorn
import sys
import json

app = FastAPI(title="sqlglot-ts", version="1.0.0")


class TranspileRequest(BaseModel):
    sql: str
    from_dialect: str
    to_dialect: str
    pretty: bool = True
    error_level: str = "WARN"  # IGNORE, WARN, RAISE, IMMEDIATE


class TranspileResponse(BaseModel):
    success: bool
    sql: str = ""
    statements: list[str] = []
    errors: list[str] = []
    warnings: list[str] = []


class ParseRequest(BaseModel):
    sql: str
    dialect: str


class ParseResponse(BaseModel):
    success: bool
    ast: str = ""
    errors: list[str] = []


class DialectsResponse(BaseModel):
    dialects: list[str]


@app.post("/transpile", response_model=TranspileResponse)
def transpile(req: TranspileRequest):
    """Transpile SQL from one dialect to another."""
    try:
        error_level = getattr(
            sqlglot.errors.ErrorLevel,
            req.error_level,
            sqlglot.errors.ErrorLevel.WARN,
        )
        results = sqlglot.transpile(
            req.sql,
            read=req.from_dialect,
            write=req.to_dialect,
            pretty=req.pretty,
            error_level=error_level,
        )
        return TranspileResponse(
            success=True,
            sql=";\n".join(results) + (";" if results else ""),
            statements=results,
            errors=[],
            warnings=[],
        )
    except sqlglot.errors.SqlglotError as e:
        return TranspileResponse(
            success=False,
            sql="",
            statements=[],
            errors=[str(e)],
            warnings=[],
        )
    except Exception as e:
        return TranspileResponse(
            success=False,
            sql="",
            statements=[],
            errors=[f"Unexpected error: {str(e)}"],
            warnings=[],
        )


@app.post("/transpile-statements", response_model=TranspileResponse)
def transpile_statements(req: TranspileRequest):
    """
    Transpile SQL statement-by-statement.
    Returns individual results for each statement, useful for
    identifying which specific statements fail conversion.
    """
    try:
        error_level = getattr(
            sqlglot.errors.ErrorLevel,
            req.error_level,
            sqlglot.errors.ErrorLevel.WARN,
        )
        # Parse into individual statements first
        parsed = sqlglot.parse(
            req.sql, read=req.from_dialect, error_level=error_level
        )

        results: list[str] = []
        errors: list[str] = []
        warnings: list[str] = []

        for i, stmt in enumerate(parsed):
            if stmt is None:
                continue
            try:
                transpiled = stmt.sql(dialect=req.to_dialect, pretty=req.pretty)
                results.append(transpiled)
            except Exception as e:
                original = stmt.sql(dialect=req.from_dialect)
                errors.append(
                    f"Statement {i+1} failed: {str(e)} | Original: {original[:200]}"
                )
                results.append(f"-- FAILED: {original}")

        return TranspileResponse(
            success=len(errors) == 0,
            sql=";\n".join(results) + (";" if results else ""),
            statements=results,
            errors=errors,
            warnings=warnings,
        )
    except Exception as e:
        return TranspileResponse(
            success=False,
            sql="",
            statements=[],
            errors=[str(e)],
            warnings=[],
        )


@app.post("/parse", response_model=ParseResponse)
def parse(req: ParseRequest):
    """Parse SQL and return the AST as JSON."""
    try:
        parsed = sqlglot.parse(req.sql, read=req.dialect)
        ast_json = [stmt.dump() if stmt else None for stmt in parsed]
        return ParseResponse(success=True, ast=json.dumps(ast_json, indent=2))
    except Exception as e:
        return ParseResponse(success=False, errors=[str(e)])


@app.get("/dialects", response_model=DialectsResponse)
def dialects():
    """List all supported SQL dialects."""
    actual = sorted(sqlglot.Dialect.classes.keys())
    return DialectsResponse(dialects=actual)


@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "sqlglot_version": sqlglot.__version__,
        "service": "sqlglot-ts",
    }


if __name__ == "__main__":
    import socket

    requested_port = int(sys.argv[1]) if len(sys.argv) > 1 else 0

    # Bind a socket to discover the ephemeral port, then close it and
    # pass that port to uvicorn. There is a tiny race window but it is
    # acceptable for a local-only dev tool.
    if requested_port == 0:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("127.0.0.1", 0))
        actual_port = sock.getsockname()[1]
        sock.close()
    else:
        actual_port = requested_port

    # Print the port BEFORE uvicorn starts so the TS client can read it.
    print(f"SQLGLOT_PORT={actual_port}", flush=True)

    uvicorn.run(app, host="127.0.0.1", port=actual_port, log_level="warning")
