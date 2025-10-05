from dotenv import load_dotenv
import os
from twilio.rest import Client
from flask import jsonify, request


load_dotenv()

ACCOUNT_SID = os.getenv("ACCOUNT_SID_TWILIO")
AUTH_TOKEN  = os.getenv("AUTH_TOKEN_TWILIO")
VERIFY_SID  = os.getenv("VERIFY_SID")  

client = Client(ACCOUNT_SID, AUTH_TOKEN)



def send_verification():
    #phone = request.json.get("phone")
    phone = '+5513978258866'
    v = client.verify.v2.services(VERIFY_SID).verifications.create(to=phone, channel="sms")
    return v

def check_verification(code):
    phone = '+5513978258866'
    chk = client.verify.v2.services(VERIFY_SID).verification_checks.create(to=phone, code=code)
    return chk.status  # 'approved' se ok

def main():
    #retornado = send_verification()
    #print('retornado \n', retornado)
    code = input()
    verification = check_verification(code)
    print(verification)
    
main()