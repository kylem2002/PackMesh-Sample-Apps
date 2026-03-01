cmake_minimum_required(VERSION 3.21)
project(sample_cpp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)
FetchContent_Declare(
  cpp_httplib
  GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
  GIT_TAG v0.16.2
)
FetchContent_MakeAvailable(cpp_httplib)

add_executable(sample-cpp src/main.cpp)
target_link_libraries(sample-cpp PRIVATE httplib::httplib)
