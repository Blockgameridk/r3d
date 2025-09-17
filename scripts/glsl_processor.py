# Copyright (c) 2025 Le Juez Victor
# 
# This software is provided "as-is", without any express or implied warranty. In no event 
# will the authors be held liable for any damages arising from the use of this software.
# 
# Permission is granted to anyone to use this software for any purpose, including commercial 
# applications, and to alter it and redistribute it freely, subject to the following restrictions:
# 
#   1. The origin of this software must not be misrepresented; you must not claim that you 
#   wrote the original software. If you use this software in a product, an acknowledgment 
#   in the product documentation would be appreciated but is not required.
# 
#   2. Altered source versions must be plainly marked as such, and must not be misrepresented
#   as being the original software.
# 
#   3. This notice may not be removed or altered from any source distribution.

#!/usr/bin/env python3

import sys, re
from pathlib import Path

# === Globals === #

glsl_types = {
    # Basic types
    'void', 'bool', 'int', 'uint', 'float', 'double',
    # Vector types
    'vec2', 'vec3', 'vec4', 'bvec2', 'bvec3', 'bvec4',
    'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4',
    'dvec2', 'dvec3', 'dvec4',
    # Matrix types
    'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4',
    'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
    'dmat2', 'dmat3', 'dmat4', 'dmat2x2', 'dmat2x3', 'dmat2x4',
    'dmat3x2', 'dmat3x3', 'dmat3x4', 'dmat4x2', 'dmat4x3', 'dmat4x4',
    # Sampler types
    'sampler1D', 'sampler2D', 'sampler3D', 'samplerCube',
    'sampler1DArray', 'sampler2DArray', 'samplerCubeArray',
    'sampler1DShadow', 'sampler2DShadow', 'samplerCubeShadow',
    'sampler1DArrayShadow', 'sampler2DArrayShadow', 'samplerCubeArrayShadow',
    'isampler1D', 'isampler2D', 'isampler3D', 'isamplerCube',
    'isampler1DArray', 'isampler2DArray', 'isamplerCubeArray',
    'usampler1D', 'usampler2D', 'usampler3D', 'usamplerCube',
    'usampler1DArray', 'usampler2DArray', 'usamplerCubeArray',
    # Image types
    'image1D', 'image2D', 'image3D', 'imageCube',
    'image1DArray', 'image2DArray', 'imageCubeArray',
    'iimage1D', 'iimage2D', 'iimage3D', 'iimageCube',
    'iimage1DArray', 'iimage2DArray', 'iimageCubeArray',
    'uimage1D', 'uimage2D', 'uimage3D', 'uimageCube',
    'uimage1DArray', 'uimage2DArray', 'uimageCubeArray'
}

# === Includes Processing === #

class IncludeProcessor:
    def __init__(self):
        self.included_files = set()  # Track already processed files
        self.global_definitions = {'functions': {}, 'defines': {}, 'constants': {}, 'structs': {}}
        self.file_definitions = {}  # Track which definitions come from which files
        self.file_dependencies = {}  # Track dependencies between files
        self.processed_content = {}  # Store processed content for each file

    def extract_definitions(self, content, source_file=None):
        """Extract all definitions from GLSL content: functions, defines, constants, structs"""
        definitions = {'functions': {}, 'defines': {}, 'constants': {}, 'structs': {}}

        # Extract #define directives
        for match in re.finditer(r'#define\s+([a-zA-Z_][a-zA-Z0-9_]*)', content):
            name = match.group(1)
            line_start = content.rfind('\n', 0, match.start()) + 1
            line_end = content.find('\n', match.end())
            if line_end == -1:
                line_end = len(content)
            definitions['defines'][name] = content[line_start:line_end]

        # Collect user-defined struct names for type validation
        user_types = set(re.findall(r'struct\s+([a-zA-Z_][a-zA-Z0-9_]*)', content))
        all_types = glsl_types | user_types

        # Extract functions
        for match in re.finditer(r'([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{', content):
            return_type, func_name = match.groups()

            # Only accept if return_type is a valid GLSL type or user-defined type
            if return_type not in all_types:
                continue

            # Find function body by counting braces
            brace_count = 1
            pos = match.end()
            while pos < len(content) and brace_count > 0:
                if content[pos] == '{':
                    brace_count += 1
                elif content[pos] == '}':
                    brace_count -= 1
                pos += 1

            if brace_count == 0:
                func_body = content[match.start():pos]
                calls = {call for call in re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', func_body) if call != func_name}
                definitions['functions'][func_name] = {
                    'body': func_body,
                    'return_type': return_type,
                    'calls': calls
                }

        # Extract constants
        for match in re.finditer(r'const\s+[a-zA-Z_][a-zA-Z0-9_]*\s+([a-zA-Z_][a-zA-Z0-9_]*)', content):
            name = match.group(1)
            line_start = content.rfind('\n', 0, match.start()) + 1
            line_end = content.find(';', match.end()) + 1
            if line_end > 0:
                definitions['constants'][name] = content[line_start:line_end]

        # Extract structs
        for match in re.finditer(r'struct\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{', content):
            struct_name = match.group(1)
            brace_count = 1
            pos = match.end()

            while pos < len(content) and brace_count > 0:
                if content[pos] == '{':
                    brace_count += 1
                elif content[pos] == '}':
                    brace_count -= 1
                pos += 1

            # Include trailing semicolon if present
            while pos < len(content) and content[pos] in ' \t\n':
                pos += 1
            if pos < len(content) and content[pos] == ';':
                pos += 1

            if brace_count == 0:
                definitions['structs'][struct_name] = content[match.start():pos]

        # Store definitions globally and track their source file
        if source_file:
            for category in definitions:
                for name in definitions[category]:
                    if name not in self.global_definitions[category]:
                        self.global_definitions[category][name] = definitions[category][name]
                        if source_file not in self.file_definitions:
                            self.file_definitions[source_file] = {'functions': set(), 'defines': set(), 'constants': set(), 'structs': set()}
                        self.file_definitions[source_file][category].add(name)

        return definitions

    def analyze_usage(self, calling_code, definitions):
        """Analyze which definitions are used in the calling code"""
        used = {'functions': set(), 'defines': set(), 'constants': set(), 'structs': set()}

        # Find function calls
        function_calls = re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', calling_code)
        used['functions'].update(call for call in function_calls if call in definitions['functions'])

        # Find usage of defines, constants, and structs
        for category in ['defines', 'constants', 'structs']:
            for name in definitions[category]:
                if re.search(r'\b' + re.escape(name) + r'\b', calling_code):
                    used[category].add(name)

        return used

    def resolve_dependencies(self, used_functions, definitions):
        """Resolve function dependencies transitively"""
        resolved = set(used_functions)

        while True:
            new_functions = set()
            for func_name in resolved:
                if func_name in definitions['functions']:
                    calls = definitions['functions'][func_name]['calls']
                    new_functions.update(call for call in calls if call in definitions['functions'] and call not in resolved)

            if not new_functions:
                break
            resolved.update(new_functions)

        return resolved

    def analyze_file_dependencies(self, file_content, file_path):
        """Analyze what dependencies a file needs from other files"""
        dependencies = {'functions': set(), 'defines': set(), 'constants': set(), 'structs': set()}
        
        # Find function calls
        function_calls = re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', file_content)
        dependencies['functions'].update(function_calls)

        # Find usage of defines, constants, and structs by checking against global definitions
        for category in ['defines', 'constants', 'structs']:
            for name in self.global_definitions[category]:
                if re.search(r'\b' + re.escape(name) + r'\b', file_content):
                    dependencies[category].add(name)

        self.file_dependencies[file_path] = dependencies
        return dependencies

    def get_transitive_dependencies(self, used, source_files):
        """Get all transitive dependencies including those needed by included files"""
        all_used = {category: set(items) for category, items in used.items()}
        
        # For each source file that contributes to the current usage
        for source_file in source_files:
            if source_file in self.file_dependencies:
                file_deps = self.file_dependencies[source_file]
                
                # Check if this file contributes any definitions to our current usage
                contributes = False
                if source_file in self.file_definitions:
                    file_defs = self.file_definitions[source_file]
                    for category in ['functions', 'defines', 'constants', 'structs']:
                        if any(item in file_defs[category] for item in used[category]):
                            contributes = True
                            break
                
                # If this file contributes, include its dependencies
                if contributes:
                    for category in ['functions', 'defines', 'constants', 'structs']:
                        # Add dependencies that exist in global definitions
                        valid_deps = {dep for dep in file_deps[category] 
                                     if dep in self.global_definitions[category]}
                        all_used[category].update(valid_deps)
        
        return all_used

    def build_selective_content(self, definitions, used):
        """Build content including only used definitions in correct order"""
        result_parts = []

        # Add defines, constants, and structs
        for category in ['defines', 'constants', 'structs']:
            for name in used[category]:
                if name in definitions[category]:
                    result_parts.append(definitions[category][name])

        # Add functions in dependency order
        resolved_functions = self.resolve_dependencies(used['functions'], definitions)
        added_functions = set()

        def add_function_with_deps(func_name):
            if func_name in added_functions or func_name not in definitions['functions']:
                return

            # Add dependencies first
            for called_func in definitions['functions'][func_name]['calls']:
                if called_func in resolved_functions:
                    add_function_with_deps(called_func)

            # Then add the function itself
            if func_name not in added_functions:
                result_parts.append(definitions['functions'][func_name]['body'])
                added_functions.add(func_name)

        for func_name in resolved_functions:
            add_function_with_deps(func_name)

        return '\n\n'.join(result_parts)

    def smart_include(self, include_content, calling_code, include_file_path):
        """Include only necessary parts of the included file with transitive dependencies"""
        definitions = self.extract_definitions(include_content)
        
        # Analyze what the included file itself needs
        self.analyze_file_dependencies(include_content, include_file_path)
        
        # Find direct usage in calling code
        direct_used = self.analyze_usage(calling_code, definitions)
        
        # Get source files that might contribute to dependencies
        source_files = [include_file_path]
        
        # Get transitive dependencies
        all_used = self.get_transitive_dependencies(direct_used, source_files)
        
        if not any(all_used.values()):
            return ""

        return self.build_selective_content(self.global_definitions, all_used)

    def process_includes(self, shader_content, base_path, calling_code_context=""):
        """Process #include directives with smart selective inclusion and duplicate prevention"""
        def replace_include(match):
            include_file = match.group(1)
            include_path = base_path / include_file

            # Normalize path to handle relative paths consistently
            try:
                include_path_resolved = include_path.resolve()
            except:
                include_path_resolved = include_path

            # Check if this file has already been processed
            if include_path_resolved in self.included_files:
                return ""  # Return empty string for already included files

            try:
                with open(include_path, 'r', encoding='utf-8') as f:
                    included_content = f.read()

                # Mark this file as processed before recursing
                self.included_files.add(include_path_resolved)

                # Recursively process nested includes
                processed_include = self.process_includes(included_content, include_path.parent, shader_content)

                # Store the processed content
                self.processed_content[str(include_path_resolved)] = processed_include

                # Extract definitions from this include file
                self.extract_definitions(processed_include, str(include_path_resolved))

                # Get calling code (everything except this include directive + global context)
                calling_code = shader_content.replace(match.group(0), '') + calling_code_context

                # Use smart include with transitive dependencies
                return self.smart_include(processed_include, calling_code, str(include_path_resolved))

            except FileNotFoundError:
                print(f"Warning: include file not found: {include_path}", file=sys.stderr)
                return match.group(0)

        return re.sub(r'#include\s+"([^"]+)"', replace_include, shader_content)

# === Processing Passes === #

def process_includes(shader_content, base_path):
    """Process #include directives with smart selective inclusion and duplicate prevention"""
    processor = IncludeProcessor()
    return processor.process_includes(shader_content, base_path)

def remove_comments(shader_content):
    """Remove C-style comments"""
    shader_content = re.sub(r'/\*.*?\*/', '', shader_content, flags=re.DOTALL)
    shader_content = re.sub(r'//.*?(?=\n|$)', '', shader_content)
    return shader_content

def remove_newlines(shader_content):
    """Remove unnecessary newlines while preserving preprocessor directive spacing"""
    lines = [line for line in shader_content.splitlines() if line.strip()]
    if not lines:
        return ""

    result = []
    for i, line in enumerate(lines):
        is_directive = line.lstrip().startswith('#')
        prev_directive = i > 0 and lines[i-1].lstrip().startswith('#')
        next_directive = i < len(lines)-1 and lines[i+1].lstrip().startswith('#')
        if i > 0 and (is_directive or prev_directive or next_directive):
            result.append("\n")
        result.append(line)

    return "".join(result)

def normalize_spaces(shader_content):
    """Remove redundant spaces around operators and symbols"""
    symbols = [',', '.', '(', ')', '{', '}', ';', ':', '+', '-', '*', '/', '=']

    for symbol in symbols:
        escaped = re.escape(symbol)
        shader_content = re.sub(rf'[ \t]+{escaped}', symbol, shader_content)
        shader_content = re.sub(rf'{escaped}[ \t]+', symbol, shader_content)

    shader_content = re.sub(r'\s+\n', '\n', shader_content)
    shader_content = re.sub(r'[ \t]+', ' ', shader_content)

    return shader_content

# === Main === #

def process_shader(filepath):
    """Process a shader file through all optimization passes"""
    filepath = Path(filepath)

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            shader_content = f.read()
    except FileNotFoundError:
        print(f"Error: File not found: {filepath}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error reading file: {e}", file=sys.stderr)
        sys.exit(1)

    shader_content = process_includes(shader_content, filepath.parent)
    shader_content = remove_comments(shader_content)
    shader_content = remove_newlines(shader_content)
    shader_content = normalize_spaces(shader_content)

    return shader_content

def main():
    if len(sys.argv) != 2:
        print("Usage: python glsl_processor.py <shader_path>", file=sys.stderr)
        sys.exit(1)

    formatted_shader = process_shader(sys.argv[1])
    print(formatted_shader, end="")

if __name__ == "__main__":
    main()
