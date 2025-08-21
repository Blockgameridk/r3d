find_program(PYTHON_EXECUTABLE python3 REQUIRED)

# Inline Python script to process a shader
set(SHADER_PROCESSOR_SCRIPT "
import sys
import subprocess
import os

def process_shader(shader_file, shader_name, output_file, r3d_root):
    # Minify the shader
    result = subprocess.run([
        sys.executable, 
        os.path.join(r3d_root, 'scripts', 'glsl_minifier.py'), 
        shader_file
    ], capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f'Error during minification: {result.stderr}', file=sys.stderr)
        sys.exit(1)
    
    minified_shader = result.stdout.strip()
    
    # Generate the C header
    result = subprocess.run([
        sys.executable,
        os.path.join(r3d_root, 'scripts', 'bin2c.py'),
        '--string', minified_shader,
        '--name', shader_name,
        '--type', 'char',
        output_file
    ], capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f'Error during header generation: {result.stderr}', file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) != 5:
        print('Usage: python script.py <shader_file> <shader_name> <output_file> <r3d_root>')
        sys.exit(1)
    
    process_shader(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
")

# Inline Python script to generate the main shaders.h header
set(SHADERS_HEADER_GENERATOR_SCRIPT "
import sys
import os

def generate_shaders_header(shader_names, output_file):
    with open(output_file, 'w') as f:
        f.write('#ifndef SHADERS_H\\n')
        f.write('#define SHADERS_H\\n\\n')
        f.write('// Auto-generated header that includes all shader headers\\n\\n')
        
        for shader_name in shader_names:
            f.write(f'#include \"./shaders/{shader_name}.h\"\\n')
        
        f.write('\\n#endif // SHADERS_H\\n')

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: python script.py <output_file> <shader_name1> [shader_name2] ...')
        sys.exit(1)
    
    output_file = sys.argv[1]
    shader_names = sys.argv[2:]
    generate_shaders_header(shader_names, output_file)
")

# Create the temporary Python scripts only once
file(WRITE "${CMAKE_BINARY_DIR}/process_shader.py" "${SHADER_PROCESSOR_SCRIPT}")
file(WRITE "${CMAKE_BINARY_DIR}/generate_shaders_header.py" "${SHADERS_HEADER_GENERATOR_SCRIPT}")

function(_add_shader_command shader_file output_file)
    get_filename_component(shader_name "${shader_file}" NAME)
    
    add_custom_command(
        OUTPUT "${output_file}"
        COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_BINARY_DIR}/generated/include/shaders"
        COMMAND "${PYTHON_EXECUTABLE}" "${CMAKE_BINARY_DIR}/process_shader.py" 
                "${shader_file}" "${shader_name}" "${output_file}" "${R3D_ROOT_PATH}"
        DEPENDS "${shader_file}"
        COMMENT "Processing shader: ${shader_file}"
        VERBATIM
    )
endfunction()

function(_add_shaders_header_command shader_names output_file)
    add_custom_command(
        OUTPUT "${output_file}"
        COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_BINARY_DIR}/generated/include"
        COMMAND "${PYTHON_EXECUTABLE}" "${CMAKE_BINARY_DIR}/generate_shaders_header.py" 
                "${output_file}" ${shader_names}
        COMMENT "Generating main shaders header: ${output_file}"
        VERBATIM
    )
endfunction()

### Public functions ###

function(ProcessShader shader_file output_file_var)
    get_filename_component(shader_name "${shader_file}" NAME)
    set(output_file "${CMAKE_BINARY_DIR}/generated/include/shaders/${shader_name}.h")
    set("${output_file_var}" "${output_file}" PARENT_SCOPE)
    _add_shader_command("${shader_file}" "${output_file}")
endfunction()

function(EmbedShaders target_name)
    set(shader_files ${ARGN})
    
    if(NOT shader_files)
        message(FATAL_ERROR "EmbedShaders: No shader file specified")
    endif()
    
    set(output_files)
    set(shader_names)
    list(LENGTH shader_files shader_count)
    message(STATUS "Configuring processing of ${shader_count} shader(s) for target ${target_name}...")
    
    foreach(shader_file ${shader_files})
        if(NOT EXISTS "${shader_file}")
            message(FATAL_ERROR "EmbedShaders: Shader file not found: ${shader_file}")
        endif()
        
        get_filename_component(shader_name "${shader_file}" NAME)
        list(APPEND shader_names "${shader_name}")
        
        ProcessShader("${shader_file}" output_file)
        list(APPEND output_files "${output_file}")
        message(STATUS "  - ${shader_file} -> ${output_file}")
    endforeach()
    
    # Generate the main shaders.h header
    set(main_shaders_header "${CMAKE_BINARY_DIR}/generated/include/shaders.h")
    _add_shaders_header_command("${shader_names}" "${main_shaders_header}")
    list(APPEND output_files "${main_shaders_header}")
    
    set(shader_target "${target_name}_shaders")
    add_custom_target(${shader_target}
        DEPENDS ${output_files}
        COMMENT "Generating shader headers for ${target_name}"
    )
    
    add_dependencies(${target_name} ${shader_target})
    target_include_directories(${target_name} PRIVATE "${CMAKE_BINARY_DIR}/generated/include")
    
    message(STATUS "Target ${shader_target} created with ${shader_count} shader(s)")
    message(STATUS "Main shaders header: ${main_shaders_header}")
endfunction()
