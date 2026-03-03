#!/bin/bash
# YM API Auth Test Script - Try both XML and REST APIs
# Usage: ./test-auth.sh <client_id> <api_key> <api_password>

CLIENT_ID="$1"
API_KEY="$2"
API_PASSWORD="$3"

if [ -z "$CLIENT_ID" ] || [ -z "$API_KEY" ] || [ -z "$API_PASSWORD" ]; then
    echo "Usage: ./test-auth.sh <client_id> <api_key> <api_password>"
    exit 1
fi

echo "=== YM API Auth Tests ==="
echo ""

##########################################################
# APPROACH A: REST API with direct /Ams/Authenticate
##########################################################
echo "========== APPROACH A: REST /Ams/Authenticate =========="

echo "--- A1: Authenticate as Admin with UserName=apikey, Password=apipassword ---"
RESP=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "{\"provider\":\"credentials\",\"UserName\":\"${API_KEY}\",\"Password\":\"${API_PASSWORD}\",\"UserType\":\"Admin\",\"ClientID\":${CLIENT_ID}}" \
    "https://ws.yourmembership.com/Ams/Authenticate")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "Status: $STATUS"
echo "Response: ${BODY:0:500}"
echo ""

echo "--- A2: /auth with credentials provider ---"
RESP=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "{\"provider\":\"credentials\",\"UserName\":\"${API_KEY}\",\"Password\":\"${API_PASSWORD}\"}" \
    "https://ws.yourmembership.com/auth/credentials")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "Status: $STATUS"
echo "Response: ${BODY:0:500}"
SESSION_A2=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('SessionId',''))" 2>/dev/null)
echo ""

if [ -n "$SESSION_A2" ] && [ "$SESSION_A2" != "" ]; then
    echo "*** GOT SESSION from A2: ${SESSION_A2:0:30}... ***"
    echo ""
    echo "--- Testing data fetch with X-SS-ID ---"
    RESP=$(curl -s -w "\n%{http_code}" \
        -H "Accept: application/json" \
        -H "X-SS-ID: ${SESSION_A2}" \
        "https://ws.yourmembership.com/Ams/${CLIENT_ID}/MemberTypes")
    STATUS=$(echo "$RESP" | tail -1)
    BODY=$(echo "$RESP" | sed '$d')
    echo "Status: $STATUS"
    echo "Response: ${BODY:0:1000}"
    echo ""
fi

##########################################################
# APPROACH B: REST API /Ams/Authenticate with different param names
##########################################################
echo "========== APPROACH B: /Ams/Authenticate variations =========="

echo "--- B1: ApiKey + ApiPassword in body ---"
RESP=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "{\"ApiKey\":\"${API_KEY}\",\"ApiPassword\":\"${API_PASSWORD}\",\"ClientID\":${CLIENT_ID},\"UserType\":\"Admin\"}" \
    "https://ws.yourmembership.com/Ams/Authenticate")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "Status: $STATUS"
echo "Response: ${BODY:0:500}"
echo ""

echo "--- B2: SoftwareLicenseKey + Password ---"
RESP=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "{\"SoftwareLicenseKey\":\"${API_KEY}\",\"Password\":\"${API_PASSWORD}\",\"ClientID\":${CLIENT_ID},\"UserType\":\"Admin\"}" \
    "https://ws.yourmembership.com/Ams/Authenticate")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "Status: $STATUS"
echo "Response: ${BODY:0:500}"
echo ""

##########################################################
# APPROACH C: REST /Ams/{ClientID}/Authenticate
##########################################################
echo "========== APPROACH C: /Ams/{ClientID}/Authenticate =========="

echo "--- C1: POST with credentials ---"
RESP=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "{\"UserName\":\"${API_KEY}\",\"Password\":\"${API_PASSWORD}\",\"UserType\":\"Admin\"}" \
    "https://ws.yourmembership.com/Ams/${CLIENT_ID}/Authenticate")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "Status: $STATUS"
echo "Response: ${BODY:0:500}"
SESSION_C1=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('SessionId',''))" 2>/dev/null)
echo ""

if [ -n "$SESSION_C1" ] && [ "$SESSION_C1" != "" ]; then
    echo "*** GOT SESSION from C1: ${SESSION_C1:0:30}... ***"
    echo ""
    echo "--- Testing data fetch with X-SS-ID ---"
    RESP=$(curl -s -w "\n%{http_code}" \
        -H "Accept: application/json" \
        -H "X-SS-ID: ${SESSION_C1}" \
        "https://ws.yourmembership.com/Ams/${CLIENT_ID}/MemberTypes")
    STATUS=$(echo "$RESP" | tail -1)
    BODY=$(echo "$RESP" | sed '$d')
    echo "Status: $STATUS"
    echo "Response: ${BODY:0:1000}"
    echo ""
fi

##########################################################
# APPROACH D: XML API (api.yourmembership.com)
##########################################################
echo "========== APPROACH D: XML API Session.Create =========="

SESSION_XML="<?xml version=\"1.0\" encoding=\"utf-8\"?>
<YourMembership>
  <Version>2.25</Version>
  <ApiKey>${API_KEY}</ApiKey>
  <CallID>001</CallID>
  <SaPasscode>${API_PASSWORD}</SaPasscode>
  <Call Method=\"Session.Create\"></Call>
</YourMembership>"

echo "--- D1: XML Session.Create ---"
RESP=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/x-www-form-urlencoded; charset=utf-8" \
    -d "$SESSION_XML" \
    "https://api.yourmembership.com")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "Status: $STATUS"
echo "Response: ${BODY:0:1000}"
echo ""

echo "=== Done ==="
echo "Look for any response with a SessionId or 200 status with data."
