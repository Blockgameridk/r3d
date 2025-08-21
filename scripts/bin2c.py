# Copyright (c) 2024-2025 Le Juez Victor
#
# This software is provided "as-is", without any express or implied warranty. In no event
# will the authors be held liable for any damages arising from the use of this software.
#
# Permission is granted to anyone to use this software for any purpose, including commercial
# applications, and to alter it and redistribute it freely, subject to the following restrictions:
#
# 1. The origin of this software must not be misrepresented; you must not claim that you
# wrote the original software. If you use this software in a product, an acknowledgment
# in the product documentation would be appreciated but is not required.
#
# 2. Altered source versions must be plainly marked as such, and must not be misrepresented
# as being the original software.
#
# 3. This notice may not be removed or altered from any source distribution.

import sys, os, argparse

def to_identifier(name):
    """Convert filename to valid C identifier"""
    return name.upper().replace('.', '_').replace('-', '_')

def write_header_from_file(file_path, out_path, char_type='unsigned char'):
    """Convert a file into a C header with null termination"""
    name = os.path.basename(file_path)
    guard = to_identifier(name) + '_H'
    array_name = to_identifier(name)

    with open(file_path, 'rb') as f:
        data = f.read()

    write_data_to_header(data, out_path, guard, array_name, char_type)

def write_header_from_string(input_string, array_name, out_path, char_type='unsigned char'):
    """Convert a string into a C header with null termination"""
    guard = to_identifier(array_name) + '_H'
    array_name = to_identifier(array_name)

    # Interpret escape sequences like \n, \t, etc., then encode to bytes
    data = input_string.encode('utf-8').decode('unicode_escape').encode('utf-8')

    write_data_to_header(data, out_path, guard, array_name, char_type)

def write_data_to_header(data, out_path, guard, array_name, char_type='unsigned char'):
    """Write binary data to C header with null termination"""
    # Always ensure there is a null terminator, even if it's duplicated
    # Because some formats will include one by default and others won't  
    # A '\0' must therefore always be added for simplicity
    data = data + b'\0'

    # Size without null terminator for convenience
    data_size = len(data) - 1

    with open(out_path, 'w') as f:
        f.write(f"#ifndef {guard}\n")
        f.write(f"#define {guard}\n\n")

        # Add C++ compatibility guard
        f.write("#ifdef __cplusplus\n")
        f.write("extern \"C\" {\n")
        f.write("#endif\n\n")

        f.write(f"static const {char_type} {array_name}[] = {{\n")

        # Write bytes in groups of 16 per line for readability
        for i, byte in enumerate(data):
            if i % 16 == 0:
                f.write("    ")

            f.write(f"0x{byte:02x}")

            if i < len(data) - 1:
                f.write(", ")

            if (i + 1) % 16 == 0 or i == len(data) - 1:
                f.write("\n")

        f.write("};\n\n")
        f.write(f"#define {array_name}_SIZE {data_size}\n\n")

        # Close C++ compatibility guard
        f.write("#ifdef __cplusplus\n")
        f.write("}\n")
        f.write("#endif\n\n")

        f.write(f"#endif // {guard}\n")

def main():
    parser = argparse.ArgumentParser(
        description='Convert a file or string to a null-terminated C array header'
    )
    parser.add_argument('output', help='Output header file (.h)')

    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument('-f', '--file', help='Input file to convert')
    input_group.add_argument('-s', '--string', help='String to convert')

    parser.add_argument('-n', '--name', help='Array name (required with --string)')
    parser.add_argument('-t', '--type', choices=['char', 'unsigned char'], 
                       default='unsigned char', 
                       help='Character type for the array (default: unsigned char)')

    args = parser.parse_args()

    if args.string and not args.name:
        parser.error("--name is required when using --string")

    if args.file:
        write_header_from_file(args.file, args.output, args.type)
    elif args.string:
        write_header_from_string(args.string, args.name, args.output, args.type)

if __name__ == "__main__":
    main()
