import datetime
import time
import ntplib


def get_ntp_time(server="pool.ntp.org"):
    try:
        # Create an NTP client
        client = ntplib.NTPClient()

        # Request time from the server (timeout after 5 seconds if no response)
        response = client.request(server, version=3, timeout=5)

        # The response.tx_time is a Unix timestamp (seconds since 1970)
        ntp_timestamp = response.tx_time

        # Convert the timestamp to local human-readable time
        local_time = datetime.datetime.fromtimestamp(ntp_timestamp)

        return local_time

    except Exception as e:
        print(f"Error fetching time from NTP server: {e}")
        return None

def GetTimeInList():

    if __name__ == "__main__":
        print("Fetching time from NTP...")
        current_time = get_ntp_time()

        if current_time:

            print(current_time)
            hour = list(current_time.strftime('%H'))
            min = list(current_time.strftime('%M'))
            sec = list(current_time.strftime('%S'))

            timeList = {
                'hourD1': hour[0],
                'hourD2': hour[1],
                'minD1': min[0],
                'minD2': min[1],
                'secD1': sec[0],
                'secD2': sec[1]
            }