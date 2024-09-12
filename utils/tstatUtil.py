#!/usr/bin/env python3

import argparse
import fcntl
import time
import os
import sys
from pymodbus.client import ModbusSerialClient as ModbusClient

# TSTAT7 Registers Set
tstat7Registers = [
    # Register Address, Value
    [142, 20],
    [143, 20],
    [144, 20],
    [145, 20],
    [146, 20],
    [728, 1],
    [122, 1],
    [123, 1],
    [124, 0],
    [104, 1],
    [117, 10],
    [254, 31],  # Setting relays to manual switch
    [262, 1],
    [565, 0],  # Do not enable day/night change
    [730, 0],  # Do not enforce manaual keypad temp limits
]

tstat7CoreRegs = [
    [142, 20],
    [143, 20],
    [144, 20],
    [145, 20],
    [157, 0],
    [158, 0],
    [169, 0],
    [170, 0],
    [345, 700],
    [350, 700],
]

tStat7RegistersNew = [
  [103, 1],
  [104, 1],
  [105, 1],
  [106, 3],
  [107, 1],
  [110, 1],
  [117, 5], 
  [122, 1],
  [123, 1],
  [124, 0],
  [125, 0],
  [142, 20],
  [143, 20],
  [144, 20],
  [145, 20],
  [146, 20],
  [209, 0],
  [241, 3],
  [242, 30],
  [262, 1],
  [345, 700], 
  [346, 5], 
  [347, 5], 
  [348, 700], 
  [349, 68],
  [350, 67],
  [352, 5], 
  [353, 5], 
  [354, 67],
  [355, 720],
  [364, 70],
  [365, 74],
  [366, 64],
  [373, 1],
  [396, 0],
  [418, 5],
  [419, 0],
  [424, 22],
  [425, 0],
  [426, 6],
  [427, 0],
  [432, 21],
  [433, 0],
  [254, 31],
  [565, 1],
  [730, 0],
  [262, 1],
  [728, 1],
];

parser = argparse.ArgumentParser(
    prog="tstatUtil",
    description='utility for reading and writing to tstats'
)

parser.add_argument('-d', '--device', help='Serial port for communication',
                    required=False, default='/dev/ttyUSB0', type=str, metavar='DEV_MGR')
parser.add_argument('--baudrate', help='Baudrate for serail',
                    required=False, default=19200, type=int, metavar='BAUD')
parser.add_argument('--id', help='ID of tstat to read/write',
                    type=int, required=False)
parser.add_argument('--readone', help='Read one register', type=int, metavar='REG')
parser.add_argument('--writeone', help='Write one register', nargs=2, type=int, metavar=('REG', 'VAL'))
parser.add_argument(
    '--readrange', help='Read a range of registers', nargs=2, type=int, metavar=('START', 'END'))
parser.add_argument(
    '--readfile', help='Read the registers from a register file', required=False, type=str, metavar='FILE')
parser.add_argument(
    '--scan', help='Scan for tstats in a range', nargs=2, type=int, metavar=('B', 'E'))
parser.add_argument('--move', help='Move a tstat to a new ID', type=int, metavar=('NEW'))
parser.add_argument('--relay', help='Set the relay state', type=int, metavar=('SET'))
parser.add_argument('--set', help='Set the setpoint', type=int, metavar=('TEMP'))
parser.add_argument('--setTime', help='Set the time', type=str, metavar=('HH:MM'))
parser.add_argument(
    '--verify', help='Verify the registers', action='store_true')
parser.add_argument('--fix', help='Fix the registers', action='store_true')
parser.add_argument('--core', help='Use core registers', action='store_true')
parser.add_argument('--timeout', help='Timeout for serial',
                    required=False, default=1, type=int)
parser.add_argument('-D', '--debug', help='Enable debug output',
                    required=False, action='store_true')

args = parser.parse_args()

# create a file named /tmp/devices.lock to prevent multiple instances of
# this script from running at the same time
# this is a hack, but it works
def acquire_lock():
    lockfile = '/tmp/pydevices.lock'
    lock_fd = os.open(lockfile, os.O_CREAT | os.O_WRONLY)
    try:
        fcntl.lockf(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return lock_fd
    except BlockingIOError:
        print("Another instance is already running. Waiting for the lock...")
        while True:
            try:
                fcntl.lockf(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                time.sleep(1)
                continue
        print("Lock acquired.")
        return lock_fd
    except Exception as e:
        print(f"Could not acquire lock")
        sys.exit(1)


def release_lock(lock_fd):
    try:
        fcntl.lockf(lock_fd, fcntl.LOCK_UN)
        os.close(lock_fd)
    except Exception as e:
        print(f"Error releasing lock")

def scan_tstats(start, end):
    start_time = time.time()
    print('Starting SCAN for tstats on device (use -d to change): {}, addr range: {}-{}, register: 7'.format(args.device, start, end))
    print('Model Values: 4/12(5C), 6(6), 8(5I), 16(5E), 93(7), 213(HUM)')
    client = ModbusClient(
        method='rtu',
        port=args.device,
        baudrate=args.baudrate,
        timeout=args.timeout
    )

    try:
        client.connect()

        print('Scanning for tstats...')
        # found_devices = []
        # not_found_devices = []

        for i in range(start, end + 1):
            result = client.read_holding_registers(7, 1, slave=i)
            if result.isError():
                print('Addr: {}    Not Found'.format(i))
                # not_found_devices.append(i)
            else:
                print('Addr: {}    Value: {}'.format(i, result.registers[0]))
                # found_devices.append([i, result.registers[0]])
            time.sleep(0.1)

        # for found_device in found_devices:
        #     print('Addr: {}    Value: {}'.format(found_device[0], found_device[1]))
        print('Scan complete')
        print('Completion time: {} seconds'.format(time.time() - start_time))
        client.close()
        return
    except Exception as e:
        print('Error: {}'.format(e))
        client.close()
        return


def move_tstat(old_id, new_id):
    # read the registers from the old tstat
    client = ModbusClient(
        method='rtu',
        port=args.device,
        baudrate=args.baudrate,
        timeout=args.timeout
    )

    try:
        client.connect()
        if new_id > 254 or new_id < 1:
            print('Error: Invalid ID {}'.format(new_id))
            client.close()
            return

        print('Moving tstat {} to {}'.format(old_id, new_id))

        old_registers = client.read_holding_registers(6, 1, slave=old_id)
        if old_registers.isError():
            print('Error: No device found at ID {}'.format(old_id))
            client.close()
            return

        # read the registers from the new tstat
        new_registers = client.read_holding_registers(6, 1, slave=new_id)
        result = client.read_holding_registers(7, 1, slave=new_id)
        if result.isError():
            print('Address is free at ID {}. Moving on'.format(new_id))
            pass
        else:
            print('Address is not free at ID {}. Moving on'.format(new_id))
            client.close()
            return
        if new_registers.isError():
            pass
        else:
            print('Address is free at ID {}. Moving on'.format(new_id))

        # ask the user if they want to continue
        usr_resp = input(
            'Are you sure you want to move tstat {} to {}? (y/n) '.format(old_id, new_id))
        if 'n' not in usr_resp.lower():
            # write the registers to the new tstat
            print('Moving tstat...')
            result = client.write_register(6, new_id, slave=old_id)
            result = client.write_register(6, new_id, slave=old_id)
            if result.isError():
                print('Error moving tstat')
                client.close()
                return

            # read the registers from the new tstat
            new_registers = client.read_holding_registers(6, 1, slave=new_id)
            if new_registers.isError():
                print('Error moving tstat')
                client.close()
                return

            print('Done')
            return
        else:
            print('Aborting')
            return
    except Exception as e:
        print('Error: {}'.format(e))
        client.close()
        return


def update_set_temp(id, set):
    client = ModbusClient(
        method='rtu',
        port=args.device,
        baudrate=args.baudrate,
        timeout=args.timeout
    )

    try:
        client.connect()

        print('Updating setpoint for tstat {} to {}'.format(id, set))

        result = client.write_register(345, set, slave=id)
        result = client.write_register(345, set, slave=id)
        if result.isError():
            print('Error writing registers')
            client.close()
            return
        result = client.write_register(350, set, slave=id)
        result = client.write_register(350, set, slave=id)
        if result.isError():
            print('Error writing registers')
            client.close()
            return
        client.close()
        print('Done')
        return
    except Exception as e:
        print('Error: {}'.format(e))
        client.close()
        return


def read_range(id, start, end):
    client = ModbusClient(
        method='rtu',
        port=args.device,
        baudrate=args.baudrate,
        timeout=args.timeout
    )

    try:
        client.connect()

        vals = {}
        print('Reading range {} to {} from tstat {}'.format(start, end, id))

        for i in range(start, end + 1):
            result = client.read_holding_registers(i, 1, slave=id)
            if result.isError():
                print('Error reading register {}'.format(i))
            else:
                vals[i] = result.registers
            time.sleep(0.1)

        print(vals)
        client.close()
        return
    except Exception as e:
        print('Error: {}'.format(e))
        client.close()
        return


def read_one(id, reg):
    client = ModbusClient(
        method='rtu',
        port=args.device,
        baudrate=args.baudrate,
        timeout=args.timeout
    )

    try:
        client.connect()

        print('Reading register {} from tstat {}'.format(reg, id))

        result = client.read_holding_registers(reg, 1, slave=id)
        if result.isError():
            print('Error reading registers')
            client.close()
            return

        print("Address: {} Value: {}".format(reg, result.registers))
        client.close()
        return
    except Exception as e:
        print('Error: {}'.format(e))
        client.close()
        return


def read_from_config(id, file):
    client = ModbusClient(
        method='rtu',
        port=args.device,
        baudrate=args.baudrate,
        timeout=args.timeout
    )

    try:
        client.connect()

        if not os.path.isfile(file):
            print('File {} not found'.format(file))
            return

        print('Reading registers from {}'.format(file))

        with open(file, 'r') as f:
            while True:
                line = f.readline()
                if not line:
                    break
                if line[0] == '#':
                    continue
                line = line.split(',')
                if len(line) != 2:
                    continue

                print('Writing {} to Address {}'.format(line[1], line[0]))
                result = client.write_register(
                    int(line[0]), int(line[1]), unit=id)
                result = client.write_register(
                    int(line[0]), int(line[1]), unit=id)
                if result.isError():
                    print('Error writing register {}'.format(line[0]))
                    continue

        client.close()
        print('Done')
        return
    except Exception as e:
        print('Error: {}'.format(e))
        client.close()
        return


def update_relay(id, value):
    client = ModbusClient(
        method='rtu',
        port=args.device,
        baudrate=args.baudrate,
        timeout=args.timeout
    )

    try:
        client.connect()

        print('Updating relay for tstat {} to {}'.format(id, value))

        result = client.write_register(254, 31, slave=id)
        result = client.write_register(254, 31, slave=id)
        if result.isError():
            print('Error updating relay')
            client.close()
            return
        result = client.write_register(209, value, slave=id)
        result = client.write_register(209, value, slave=id)
        if result.isError():
            print('Error updating relay')
            client.close()
            return
        client.close()
        print('Done')
        return
    except Exception as e:
        print('Error: {}'.format(e))
        client.close()
        return


def update_time(id, set_time):
    client = ModbusClient(
        method='rtu',
        port=args.device,
        baudrate=args.baudrate,
        timeout=args.timeout
    )

    try:
        client.connect()

        set_time = set_time.split(':')
        hour = int(set_time[0])
        minute = int(set_time[1])

        print('Updating time for tstat {} to {}:{}'.format(
            id, set_time[0], set_time[1]))

        result = client.write_register(414, hour, slave=id)
        result = client.write_register(414, hour, slave=id)
        if result.isError():
            print('Error updating hour')
            client.close()
            return

        time.sleep(0.1)
        result = client.write_register(415, minute, slave=id)
        result = client.write_register(415, minute, slave=id)
        if result.isError():
            print('Error updating minute')
            client.close()
            return

        time.sleep(0.1)
        result = client.read_holding_registers(414, 1, slave=id)
        if result.isError():
            print('Error reading hour')
            client.close()
            return

        if result.registers[0] != hour:
            print('Error updating hour')
            client.close()
            return
        time.sleep(0.1)
        result = client.read_holding_registers(415, 1, slave=id)
        if result.isError():
            print('Error reading minute')
            client.close()
            return

        if result.registers[0] != minute:
            print('Error updating minute')
            client.close()
            return

        client.close()
        print('Done')
        return
    except Exception as e:
        print('Error: {}'.format(e))
        client.close()
        return


def write_single(id, reg, value):
    client = ModbusClient(
        method='rtu',
        port=args.device,
        baudrate=args.baudrate,
        timeout=args.timeout
    )

    try:
        client.connect()
        print('Writing {} to register {} on tstat {}'.format(value, reg, id))
        result = client.write_register(reg, value, slave=id)
        result = client.write_register(reg, value, slave=id)
        if result.isError():
            print('Error writing register {}'.format(reg))
            client.close()
            return
        client.close()
        print('Done')
        return
    except Exception as e:
        print('Error: {}'.format(e))
        client.close()
        return


def verify_registers(id):
    client = ModbusClient(
        method='rtu',
        port=args.device,
        baudrate=args.baudrate,
        timeout=args.timeout
    )

    try:
        non_matching = []
        matching = []
        print('Verifying registers for tstat {}'.format(id))

        client.connect()
        for reg in tStat7RegistersNew:
            result = client.read_holding_registers(reg[0], 1, slave=id)
            if result.isError():
                print('Error reading register {}'.format(reg[0]))
                client.close()
                return

            if result.registers[0] != reg[1]:
                non_matching.append(reg)
            else:
                matching.append(reg)

        client.close()

        print('Non-matching registers: {}'.format(non_matching))
        print('Matching registers: {}'.format(matching))
        return
    except Exception as e:
        print('Error: {}'.format(e))
        client.close()
        return


def fix_registers(id):
    client = ModbusClient(
        method='rtu',
        port=args.device,
        baudrate=args.baudrate,
        timeout=args.timeout
    )

    try:
        print('Fixing registers for tstat {}'.format(id))

        client.connect()
        for reg in tStat7RegistersNew:
            result = client.write_register(reg[0], reg[1], slave=id)
            result = client.write_register(reg[0], reg[1], slave=id)
            if result.isError():
                print('Error writing register {}'.format(reg[0]))
                continue

        client.close()
        print('Done')
        return
    except Exception as e:
        print('Error: {}'.format(e))
        client.close()
        return


def fix_core_registers(id):
    client = ModbusClient(
        method='rtu',
        port=args.device,
        baudrate=args.baudrate,
        timeout=args.timeout
    )

    try:
        print('Fixing core registers for tstat {}'.format(id))

        client.connect()
        for reg in tStat7RegistersNew:
            result = client.write_register(reg[0], reg[1], slave=id)
            result = client.write_register(reg[0], reg[1], slave=id)
            if result.isError():
                print('Error writing register {}'.format(reg[0]))
                continue

        client.close()
        print('Done')
        return
    except Exception as e:
        print('Error: {}'.format(e))
        client.close()
        return


try:
    lock_fd = acquire_lock()
    
    print('\nUsing following settings:')
    print('Device: {}'.format(args.device))
    print('Baudrate: {}'.format(args.baudrate))
    print('Timeout: {}'.format(args.timeout))
    print('')
    
    if args.scan is not None:
        scan_tstats(args.scan[0], args.scan[1])
    elif args.move is not None:
        move_tstat(args.id, args.move)
    elif args.set is not None:
        if args.id is not None:
            update_set_temp(args.id, args.set)
        else:
            print('Must specify tstat id')
    elif args.readrange is not None:
        if args.id is not None:
            read_range(args.id, args.readrange[0], args.readrange[1])
        else:
            print('Must specify tstat id')
    elif args.readone is not None:
        if args.id is not None:
            read_one(args.id, args.readone)
        else:
            print('Must specify tstat id')
    elif args.readfile is not None:
        if args.id is not None:
            read_from_config(args.id, args.readfile)
        else:
            print('Must specify tstat id')
    elif args.writeone is not None:
        if args.id is not None:
            write_single(args.id, args.writeone[0], args.writeone[1])
        else:
            print('Must specify tstat id')
    elif args.setTime is not None:
        if args.id is not None:
            update_time(args.id, args.setTime)
        else:
            print('Must specify tstat id')
    elif args.relay is not None:
        if args.id is not None:
            update_relay(args.id, args.relay)
        else:
            print('Must specify tstat id')
    elif args.verify:
        if args.id is not None:
            if args.fix and args.core:
                fix_core_registers(args.id)
            elif args.fix:
                fix_registers(args.id)
            else:
                verify_registers(args.id)
        else:
            print('Must specify tstat id')
except Exception as e:
    print('Error: {}'.format(e))
finally:
    release_lock(lock_fd)
    # Remove the lock file
    try:
        os.remove('/tmp/pydevices.lock')
    except Exception as e:
        print('Error removing lock file: {}'.format(e))