
		#ifndef _THIRD_H
		#include "third.h"
		#endif

		#ifndef __IOSTREAM_H
		#include <iostream.h>
		#endif

		#ifndef  __MATH_H
		#include <math.h>
		#endif

		#ifndef _ANEXA_H
		#include "anexa.h"
		#endif

		#ifndef _JOINTYP_H
		#include "jointyp.h"
		#endif


		float	Third::RPos( float t )
		{
			float	result;
			float	fNorma;

			fNorma = t / m_fTrajectoryTime;
			result = ( float )( 3 * pow( fNorma, 2)  -  2 * pow( fNorma, 3) );

			return result;
		}



		float	Third::RSpd( float t )
		{
			float	result;
			float   fNorma;

			fNorma = t / m_fTrajectoryTime;
			result = ( float )( 6*( fNorma - pow(fNorma,2) ) / m_fTrajectoryTime );

			return result;
		}



		float	Third::RAcc( float t )
		{
			float result;
			float	fNorma;

			fNorma = t / m_fTrajectoryTime;
			result = ( float )( 6*( 1 - 2*fNorma ) / pow( m_fTrajectoryTime,2 ) );

			return result;
		}



		float	Third::m_ComputeTrajectoryTime( void )
		{
				float	temp1, temp2;
				float	result;

				temp1 = ( float )( ( 3*ABS( D() ) )   / ( 2*m_fKV ) );
				temp2 = ( float )( sqrt( 6*ABS( D() ) /     m_fKA ) );

				if( temp1 >= temp2 )
					result = temp1;
				else
					result = temp2;

				if( result >= 0 )
					return result;
				else
					return 0;
		}




		BOOL	Third::m_ComputeLambda( void )
		{
				// m_fTrajectoryTime must be found out by the Robot !

				if( m_fTrajectoryTime > 0 )
				{
					m_fLambda = (float) pow( (m_ComputeTrajectoryTime() / m_fTrajectoryTime), 2 );

					// reducing maximum acceleration by the factor m_fLambda
					m_fKA     = (float) m_fKA * m_fLambda;

					return TRUE;
				}
				else
					return FALSE;
		}



		BOOL	Third::m_ComputePosition( void )
		{
				float	time;		// counter for current time
				float	step;		// stepping through the total time;
				UINT	i;			// counter for array

				if( m_uiNrOfValues > 0 )
					m_pfPosition = (float*) new float[ m_uiNrOfValues ];

				if( m_pfPosition != NULL )
				{
					step = m_fTrajectoryTime / m_uiDivisions;
					time = 0;
					for( i=0; i<m_uiNrOfValues; i++ )
					{
						m_pfPosition[i] = (float)( m_fInitialPosition + RPos( time ) * D() );
						time += step;
					}
					return TRUE;
				}
				else
					return FALSE;
		}




		BOOL	Third::m_ComputeSpeed( void )
		{
				float	time;		// counter for current time
				float	step;		// stepping through the total time;
				UINT	i;			// counter for array

				if( m_uiNrOfValues > 0 )
					m_pfSpeed = (float*) new float[ m_uiNrOfValues ];

				if( m_pfSpeed != NULL )
				{
					step = m_fTrajectoryTime / m_uiDivisions;
					time = 0;
					for( i=0; i<m_uiNrOfValues; i++ )
					{
						m_pfSpeed[i] = (float)( RSpd( time ) * D() );
						time += step;
					}
					return TRUE;
				}
				else
					return FALSE;

		}



		BOOL	Third::m_ComputeAcceleration( void )
		{
				float	time;		// counter for current time
				float	step;		// stepping through the total time;
				UINT	i;			// counter for array

				if( m_uiNrOfValues > 0 )
					m_pfAcceleration = (float*) new float[ m_uiNrOfValues ];

				if( m_pfAcceleration != NULL )
				{
					step = m_fTrajectoryTime / m_uiDivisions;
					time = 0;
					for( i=0; i<m_uiNrOfValues; i++ )
					{
						m_pfAcceleration[i] = (float)( RAcc( time ) * D() );
						time += step;
					}
					return TRUE;
				}
				else
					return FALSE;
		}




		Third::Third(  void )
		{
			m_uiType = THIRD;
		}


		Third::~Third( void )
		{
			// do nothing ...
		}
